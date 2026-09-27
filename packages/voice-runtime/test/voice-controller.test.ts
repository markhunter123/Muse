import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceController } from "../src/voice-controller.js";
import {
  VoiceRecognizerError,
  type AudioCapture,
  type AudioCaptureFactory,
  type SpeechRecognizer,
  type VoiceSettings,
  type VoiceState,
} from "../src/types.js";

// Stand-in for a recognizer. `prepare` reproduces the local engine's rule — a
// recognizer is only ready once it has what it needs — so the controller's
// handling of a failed preparation stays covered.
function createMockRecognizer() {
  return {
    prepare: vi.fn(async (settings: VoiceSettings) => {
      if (!settings.modelId) {
        throw new VoiceRecognizerError("noModel", "No model selected");
      }
    }),
    transcribe: vi.fn().mockResolvedValue("hello world"),
    createStream: vi.fn().mockReturnValue(null),
    shutdown: vi.fn(),
  };
}

// Mock AudioCaptureFactory
function createMockCaptureFactory(): AudioCaptureFactory {
  let frameCallback: ((frame: Int16Array) => void) | null = null;

  const capture: AudioCapture = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(new Float32Array([])),
    cancel: vi.fn(),
    onFrame: vi.fn((cb) => { frameCallback = cb; }),
    get isActive() { return true; },
  };

  return {
    getDevices: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockReturnValue(capture),
    checkPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue(true),
  };
}

function defaultSettings(): VoiceSettings {
  return {
    enabled: true,
    deviceId: null,
    languages: ["zh", "en"],
    chineseVariant: "simplified",
    modelId: "whisper-large-v3-turbo",
    provider: "local",
  };
}

describe("VoiceController", () => {
  let recognizer: ReturnType<typeof createMockRecognizer>;
  let factory: AudioCaptureFactory;
  let settings: VoiceSettings;
  let controller: VoiceController;

  beforeEach(() => {
    recognizer = createMockRecognizer();
    factory = createMockCaptureFactory();
    settings = defaultSettings();
    controller = new VoiceController(
      recognizer as unknown as SpeechRecognizer,
      factory,
      () => settings,
    );
  });

  it("starts in idle state", () => {
    expect(controller.state.phase).toBe("idle");
  });

  it("prepare transitions to ready", async () => {
    await controller.prepare();
    expect(controller.state.phase).toBe("ready");
  });

  it("prepare hands the resolved settings to the recognizer", async () => {
    await controller.prepare();
    expect(recognizer.prepare).toHaveBeenCalledWith(settings);
  });

  it("prepare surfaces a recognizer refusal with its code", async () => {
    settings.modelId = "";
    const seen: VoiceState[] = [];
    controller.on("stateChange", (state) => seen.push(state));

    await expect(controller.prepare()).rejects.toThrow("No model selected");

    // The code is what lets the UI say "pick a model" in the user's language
    // instead of printing the recognizer's English diagnostic.
    expect(seen.at(-1)?.phase).toBe("error");
    expect(seen.at(-1)?.errorCode).toBe("noModel");
  });

  it("a refused session does not wedge the controller", async () => {
    // A terminal phase ends the session, not the controller. Parking at
    // "error" made every later attempt throw "Cannot start from phase: error",
    // so a user with no credentials could never succeed until a restart.
    settings.modelId = "";
    await expect(controller.prepare()).rejects.toThrow("No model selected");
    expect(controller.state.phase).toBe("idle");

    settings.modelId = "whisper-large-v3-turbo";
    await controller.start();
    expect(controller.state.phase).toBe("listening");
  });

  it("a finished session does not wedge the controller", async () => {
    // The same trap on the success path: after one transcript the phase was
    // "done", which `start` also refuses.
    await controller.start();
    await expect(controller.stop()).resolves.toMatchObject({ text: "hello world" });
    expect(controller.state.phase).toBe("idle");

    await controller.start();
    expect(controller.state.phase).toBe("listening");
  });

  it("start refuses before opening the microphone when preparation fails", async () => {
    settings.modelId = "";
    await expect(controller.start()).rejects.toThrow("No model selected");
    expect(factory.create).not.toHaveBeenCalled();
  });

  it("start transitions through states", async () => {
    const phases: string[] = [];
    controller.on("stateChange", (s) => phases.push(s.phase));

    await controller.start();
    expect(phases).toContain("preparing");
    expect(phases).toContain("starting");
    expect(controller.state.phase).toBe("listening");
  });

  it("cancel returns to idle", async () => {
    await controller.start();
    controller.cancel();
    expect(controller.state.phase).toBe("idle");
  });

  it("cannot start from non-idle/ready phase", async () => {
    await controller.start();
    await expect(controller.start()).rejects.toThrow("Cannot start from phase");
  });

  it("a cancel while the device is opening is not overwritten", async () => {
    // Opening the device crosses an await, and the overlay's Cancel button is
    // live during "starting". Without a guard the continuation resurrects
    // "listening" over a session that was already torn down — and leaks a
    // capture, because `cancel()` cannot stop a device that had not opened yet.
    let openDevice: (() => void) | null = null;
    const capture: AudioCapture = {
      start: () => new Promise<void>((resolve) => { openDevice = resolve; }),
      stop: vi.fn().mockResolvedValue(new Float32Array([])),
      cancel: vi.fn(),
      onFrame: vi.fn(),
      get isActive() {
        return false;
      },
    };
    const slowFactory: AudioCaptureFactory = {
      getDevices: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockReturnValue(capture),
      checkPermission: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue(true),
    };
    const isolated = new VoiceController(
      recognizer as unknown as SpeechRecognizer,
      slowFactory,
      () => settings,
    );

    await isolated.prepare();
    const starting = isolated.start();
    await vi.waitFor(() => expect(openDevice).not.toBeNull());

    isolated.cancel();
    openDevice!();
    await starting;

    expect(isolated.state.phase).toBe("idle");
    expect(capture.cancel).toHaveBeenCalled();
  });

  it("dispose prevents further use", async () => {
    controller.dispose();
    await expect(controller.start()).rejects.toThrow("disposed");
  });

  it("emits stateChange events", async () => {
    const listener = vi.fn();
    controller.on("stateChange", listener);
    await controller.start();
    expect(listener).toHaveBeenCalled();
  });
});
