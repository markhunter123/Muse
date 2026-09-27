/**
 * VoiceService — orchestrates voice input in the Electron main process.
 *
 * Lazily loads @muse/voice-runtime on first use so that Voice disabled
 * means zero import overhead at startup.
 *
 * Owns the one decision the renderer cannot make: which recognizer runs. The
 * controller is therefore rebuilt when the provider changes, because it holds
 * its recognizer for the life of a session.
 */

import { app, BrowserWindow } from "electron";
import { IPC, resolveVoiceInputSettings, type VoiceInputSettings } from "@muse/shared";
import { PvRecorderBackend, checkMicrophonePermission, requestMicrophonePermission } from "./audio-backend";
import {
  createVoiceCredentialStore,
  type VoiceCredentialStatus,
  type VoiceCredentialStore,
  type VoiceHost,
} from "./voice-credentials";
import type {
  AudioCaptureFactory,
  AudioInputDevice,
  ModelState,
  SpeechRecognizer,
  VoicePhase,
  VoiceProvider,
  VoiceResult,
  VoiceSettings,
  VoiceState,
} from "@muse/voice-runtime";

// Lazy-loaded runtime classes
type VoiceControllerT = import("@muse/voice-runtime").VoiceController;
type TranscriptionEngineT = import("@muse/voice-runtime").TranscriptionEngine;
type ModelManagerT = import("@muse/voice-runtime").ModelManager;

/** Longest credential accepted; real ones are 36 characters. */
const MAX_CREDENTIAL_LENGTH = 256;

export interface VoiceServiceOptions {
  modelCacheDir: string;
  getWindow: () => BrowserWindow | null;
  /** Resolved lazily: voice can be used before the host has booted. */
  getHost: () => VoiceHost | null;
  /**
   * Lifecycle trace.
   *
   * Without it a session that hangs and a key that never arrived look exactly
   * the same from outside: both are silence. Every phase transition and every
   * refused request goes through here so the question is answerable.
   */
  log?: (level: "info" | "warn", message: string, fields?: Record<string, unknown>) => void;
}

export class VoiceService {
  private controller: VoiceControllerT | null = null;
  private engine: TranscriptionEngineT | null = null;
  private modelManager: ModelManagerT | null = null;
  private activeProvider: VoiceProvider | null = null;
  private captureFactory: AudioCaptureFactory;
  private settings: VoiceSettings;
  private readonly credentials: VoiceCredentialStore;
  private disposed = false;
  /** Set once the renderer has pushed its own settings, which then win. */
  private settingsPushed = false;
  private seeded = false;

  constructor(private readonly options: VoiceServiceOptions) {
    this.captureFactory = new PvRecorderBackend();
    this.credentials = createVoiceCredentialStore(options.getHost);
    // Replaced by the persisted settings on first use.
    this.settings = {
      enabled: true,
      deviceId: null,
      languages: ["zh", "en"],
      chineseVariant: "simplified",
      modelId: "",
      provider: "tencent",
    };
  }

  // ---- Settings ----

  updateSettings(patch: Partial<VoiceSettings>): void {
    this.settingsPushed = true;
    this.settings = { ...this.settings, ...patch };
  }

  // ---- Lazy initialization ----

  /**
   * Adopt what the user configured in a previous run.
   *
   * The renderer only pushes settings when the settings page is edited, so
   * without this the first dictation after a cold start would run on this
   * class's fallback values — which is how "No model selected" used to reach
   * users who had already chosen a model.
   */
  private async seedSettingsFromHost(): Promise<void> {
    if (this.seeded) return;
    this.seeded = true;
    if (this.settingsPushed) return;

    try {
      const stored = await this.options.getHost()?.call<{ voice?: unknown }>("settings.get");
      const voice = resolveVoiceInputSettings(
        stored?.voice as Partial<VoiceInputSettings> | null | undefined,
      );
      this.settings = {
        enabled: voice.enabled,
        deviceId: voice.deviceId,
        languages: voice.languages,
        chineseVariant: voice.chineseVariant,
        modelId: voice.modelId,
        provider: voice.provider,
      };
    } catch {
      // Host not up yet. The fallback above is a working configuration, and
      // the renderer's push will correct it if the user edits anything.
    }
  }

  private async ensureRuntime(): Promise<void> {
    await this.seedSettingsFromHost();

    const { VoiceController, TranscriptionEngine, ModelManager } = await import(
      "@muse/voice-runtime"
    );

    if (!this.modelManager) {
      this.modelManager = new ModelManager(this.options.modelCacheDir);
      // Built once: it wraps the model manager and holds no per-session state,
      // so rebuilding it on a provider switch would only strand the old one.
      this.engine = new TranscriptionEngine(this.modelManager);
    }

    const provider = this.settings.provider;
    if (this.controller && this.activeProvider === provider) return;
    // Swapping recognizers mid-capture would strand an open microphone, so a
    // provider change lands on the next session instead.
    if (this.controller && this.controller.state.phase !== "idle") return;

    this.controller?.dispose();
    this.controller = new VoiceController(
      await this.createRecognizer(provider, this.engine!),
      this.captureFactory,
      () => this.settings,
    );
    this.activeProvider = provider;

    // Forward state changes to renderer. The channel has to be the one the
    // renderer subscribes to: these were once ad-hoc strings here
    // ("voice:stateChanged") that no listener ever matched, so phases, levels,
    // durations, errors and finished transcripts all went nowhere and the
    // composer only ever saw the rejection of its own `start` call.
    //
    // Only transitions are traced: while listening the controller emits on
    // every audio frame, so logging each one would bury the trail in volume.
    let lastPhase: VoicePhase | null = null;
    this.controller.on("stateChange", (state: VoiceState) => {
      if (state.phase !== lastPhase) {
        lastPhase = state.phase;
        this.trace(state.phase === "error" ? "warn" : "info", "voice.phase", {
          data: {
            phase: state.phase,
            errorCode: state.errorCode,
            error: state.error,
          },
        });
      }
      this.sendToRenderer(IPC.event.voiceStateChanged, state);
    });
  }

  private async createRecognizer(
    provider: VoiceProvider,
    localEngine: TranscriptionEngineT,
  ): Promise<SpeechRecognizer> {
    if (provider === "tencent") {
      const { TencentAsrRecognizer } = await import("@muse/voice-runtime");
      return new TencentAsrRecognizer({
        readCredentials: () => this.credentials.read(),
      });
    }
    return localEngine;
  }

  // ---- Recording lifecycle ----

  async start(overrides?: Partial<VoiceSettings>): Promise<void> {
    if (this.disposed) throw new Error("VoiceService is disposed");

    if (overrides) {
      this.updateSettings(overrides);
    }

    // Logged before anything can block: "requested with no phase after it" is
    // the signature of a hang, and it is indistinguishable from "the press
    // never reached main" unless the request itself leaves a mark. It carries
    // no settings on purpose — `ensureRuntime` is what reads the stored ones,
    // so anything logged here would describe the constructor's fallback.
    this.trace("info", "voice.start.requested");

    try {
      await this.ensureRuntime();
      this.trace("info", "voice.settings.resolved", {
        data: { provider: this.settings.provider, languages: this.settings.languages },
      });
      await this.controller!.start();
    } catch (error) {
      this.trace("warn", "voice.start.refused", {
        data: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private trace(
    level: "info" | "warn",
    message: string,
    fields?: Record<string, unknown>,
  ): void {
    try {
      this.options.log?.(level, message, fields);
    } catch {
      // A trace must never be the reason a dictation fails.
    }
  }

  async stop(): Promise<VoiceResult> {
    if (!this.controller) throw new Error("Voice not started");
    return this.controller.stop();
  }

  cancel(): void {
    this.controller?.cancel();
  }

  getState(): VoiceState {
    return (
      this.controller?.state ?? {
        phase: "idle" as const,
        durationSeconds: 0,
        volumeLevel: 0,
      }
    );
  }

  // ---- Devices ----

  async getDevices(): Promise<AudioInputDevice[]> {
    return this.captureFactory.getDevices();
  }

  // ---- Models ----

  getModels(): ModelState[] {
    return this.modelManager?.getAllStates() ?? [];
  }

  async downloadModel(modelId: string): Promise<void> {
    await this.ensureRuntime();
    const gen = this.modelManager!.download(modelId);
    for await (const progress of gen) {
      this.sendToRenderer(IPC.event.voiceModelProgress, { modelId, progress });
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.ensureRuntime();
    await this.modelManager!.deleteModel(modelId);
  }

  // ---- Credentials ----

  /**
   * Store the Tencent Cloud pair. The values are written to host-core's
   * encrypted store and never echoed back to any caller.
   */
  async setCredentials(input: { secretId?: unknown; secretKey?: unknown }): Promise<void> {
    await this.credentials.write({
      secretId: readCredentialField(input?.secretId, "SecretId"),
      secretKey: readCredentialField(input?.secretKey, "SecretKey"),
    });
  }

  async clearCredentials(): Promise<void> {
    await this.credentials.clear();
  }

  async credentialStatus(): Promise<VoiceCredentialStatus> {
    return this.credentials.status();
  }

  // ---- Permissions ----

  async checkPermission(): Promise<"granted" | "denied" | "undetermined"> {
    return checkMicrophonePermission();
  }

  async requestPermission(): Promise<boolean> {
    return requestMicrophonePermission();
  }

  // ---- Lifecycle ----

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller?.dispose();
    this.engine?.shutdown();
    this.controller = null;
    this.engine = null;
    this.modelManager = null;
    this.activeProvider = null;
  }

  // ---- IPC helpers ----

  private sendToRenderer(channel: string, data: unknown): void {
    try {
      const win = this.options.getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    } catch {
      // Window may be closing
    }
  }
}

function readCredentialField(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is required`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  if (trimmed.length > MAX_CREDENTIAL_LENGTH) {
    throw new Error(`${label} is longer than ${MAX_CREDENTIAL_LENGTH} characters`);
  }
  return trimmed;
}

export function createVoiceService(options: VoiceServiceOptions): VoiceService {
  const service = new VoiceService(options);
  app.once("before-quit", () => service.dispose());
  return service;
}
