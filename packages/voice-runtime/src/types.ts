// ---- Voice Phase ----
export type VoicePhase =
  | "idle"
  | "preparing"
  | "ready"
  | "starting"
  | "listening"
  | "transcribing"
  | "done"
  | "error"
  | "cancelling";

// ---- Voice State ----
export interface VoiceState {
  phase: VoicePhase;
  /** Recording duration in seconds, updated in real-time during listening. */
  durationSeconds: number;
  /** Current volume level 0–1, updated in real-time during listening. */
  volumeLevel: number;
  /** Error message when phase is "error". Diagnostic detail, in English. */
  error?: string;
  /**
   * Set when the failure is one the UI has copy for, so the message can be
   * shown in the user's language instead of as raw vendor text.
   */
  errorCode?: VoiceErrorCode;
  /** Transcription result when phase is "done". */
  result?: VoiceResult;
}

export interface VoiceResult {
  text: string;
  speechSeconds: number;
  transcribeSeconds: number;
  language: string;
}

// ---- Voice Settings ----
export type ChineseVariant = "simplified" | "traditional-taiwan" | "traditional-hong-kong";

/** Which recognizer transcribes captured audio. Mirrors `@muse/shared`. */
export type VoiceProvider = "local" | "tencent";

export interface VoiceSettings {
  enabled: boolean;
  /** Device ID; null means system default. */
  deviceId: string | null;
  /** Language codes, e.g. ["zh", "en"]. */
  languages: string[];
  /** Chinese output variant. */
  chineseVariant: ChineseVariant;
  /** Model catalog ID. Only the `local` provider reads this. */
  modelId: string;
  /** `local` runs a bundled whisper model; `tencent` calls Tencent Cloud ASR. */
  provider: VoiceProvider;
}

// ---- Model ----
export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  languages: string[];
  sizeBytes: number;
  hfRepo: string;
  hfFilename: string;
  sha256: string;
  supportsStreaming: boolean;
  recommended: boolean;
}

export type ModelStatus =
  | "not-downloaded"
  | "downloading"
  | "downloaded"
  | "loading"
  | "loaded"
  | "error";

export interface ModelState {
  info: ModelInfo;
  status: ModelStatus;
  downloadProgress?: number;
  localPath?: string;
  error?: string;
}

// ---- Audio Capture Interface ----
export interface AudioInputDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export interface AudioCapture {
  start(): Promise<void>;
  stop(): Promise<Float32Array>;
  cancel(): void;
  onFrame(cb: (frame: Int16Array) => void): void;
  readonly isActive: boolean;
}

export interface AudioCaptureFactory {
  getDevices(): Promise<AudioInputDevice[]>;
  create(deviceId: string | null): AudioCapture;
  checkPermission(): Promise<"granted" | "denied" | "undetermined">;
  requestPermission(): Promise<boolean>;
}

// ---- Transcription ----
export interface TranscribeOptions {
  language: string;
  chineseVariant?: ChineseVariant;
}

export interface TranscriptionStream {
  feed(chunk: Float32Array): void;
  finalize(): Promise<string>;
  cancel(): void;
}

// ---- Recognizer port ----

/**
 * What a recognizer raises when the user can do something about the failure.
 * The UI translates by code; `message` stays as English diagnostic detail for
 * the log and for codes the UI has no copy for.
 */
export type VoiceErrorCode =
  | "noModel"
  | "credentialsMissing"
  | "audioTooLong"
  | "audioTooLarge"
  | "authFailed"
  | "requestFailed";

export class VoiceRecognizerError extends Error {
  readonly code: VoiceErrorCode;

  constructor(code: VoiceErrorCode, message: string) {
    super(message);
    this.name = "VoiceRecognizerError";
    this.code = code;
  }
}

/**
 * What `VoiceController` needs from whatever turns audio into text.
 *
 * The bundled whisper engine and a cloud recognizer differ in every detail —
 * one loads a model, the other signs an HTTP request — so the controller talks
 * to this port rather than to `TranscriptionEngine` directly. That is also why
 * `prepare` is part of it: the local engine's "is a model loaded?" check and
 * the cloud engine's "are there credentials?" check are the same question asked
 * of different state, and the answer has to arrive before the microphone opens.
 */
export interface SpeechRecognizer {
  /** Ready the recognizer for `settings`, or throw a {@link VoiceRecognizerError}. */
  prepare(settings: VoiceSettings): Promise<void>;
  /** A streaming session, or null when only whole buffers are supported. */
  createStream(options: TranscribeOptions): TranscriptionStream | null;
  transcribe(pcm: Float32Array, options: TranscribeOptions, signal?: AbortSignal): Promise<string>;
  shutdown(): Promise<void> | void;
}
