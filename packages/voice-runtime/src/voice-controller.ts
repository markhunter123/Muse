import { EventEmitter } from "node:events";
import { PcmChunker } from "./pcm-chunker.js";
import { convertFrames, computeRms } from "./pcm-utils.js";
import { VoiceRecognizerError } from "./types.js";
import type {
  AudioCapture,
  AudioCaptureFactory,
  SpeechRecognizer,
  TranscribeOptions,
  TranscriptionStream,
  VoiceErrorCode,
  VoicePhase,
  VoiceResult,
  VoiceSettings,
  VoiceState,
} from "./types.js";

const INITIAL_STATE: VoiceState = {
  phase: "idle",
  durationSeconds: 0,
  volumeLevel: 0,
};

/**
 * Manages the full voice input lifecycle:
 * prepare → start → listen → stop → transcribe → result.
 *
 * Events:
 * - "stateChange" (state: VoiceState)
 * - "error" (error: Error)
 */
export class VoiceController extends EventEmitter {
  private _state: VoiceState = { ...INITIAL_STATE };
  private capture: AudioCapture | null = null;
  private stream: TranscriptionStream | null = null;
  private allFrames: Int16Array[] = [];
  private chunker: PcmChunker | null = null;
  private abort: AbortController | null = null;
  private startedAt = 0;
  private disposed = false;

  constructor(
    private readonly recognizer: SpeechRecognizer,
    private readonly captureFactory: AudioCaptureFactory,
    private readonly getSettings: () => VoiceSettings,
  ) {
    super();
  }

  get state(): VoiceState {
    return this._state;
  }

  /** Get the recognizer ready — load the model, check the credentials. */
  async prepare(): Promise<void> {
    if (this.disposed) return;

    const settings = this.getSettings();
    this.setState({ phase: "preparing", durationSeconds: 0, volumeLevel: 0 });

    try {
      await this.recognizer.prepare(settings);
      this.setState({ phase: "ready", durationSeconds: 0, volumeLevel: 0 });
    } catch (error) {
      this.settle({
        phase: "error",
        durationSeconds: 0,
        volumeLevel: 0,
        error: error instanceof Error ? error.message : String(error),
        errorCode: errorCodeOf(error),
      });
      throw error;
    }
  }

  /** Start recording. Auto-prepares the model if needed. */
  async start(): Promise<void> {
    if (this.disposed) throw new Error("Controller is disposed");

    const { phase } = this._state;
    if (phase !== "idle" && phase !== "ready") {
      throw new Error(`Cannot start from phase: ${phase}`);
    }

    const settings = this.getSettings();

    this.abort = new AbortController();
    // Held locally because `cancel()` clears `this.abort` and `this.capture`.
    // Both awaits below cross a boundary the user can cancel across — the
    // overlay's Cancel button is live during "starting" — and without these
    // checks the continuation would resurrect "listening" over a session that
    // had already been torn down, leaving a capture nobody owns.
    const abort = this.abort;

    // Readying the recognizer also decides whether this recording can happen
    // at all, so it runs before the capture opens rather than after.
    if (phase !== "ready") {
      await this.prepare();
    }
    if (abort.signal.aborted) return;

    this.setState({ phase: "starting", durationSeconds: 0, volumeLevel: 0 });

    try {
      // Set up streaming transcription if supported
      const transcribeOpts: TranscribeOptions = {
        language: settings.languages[0] ?? "en",
        chineseVariant: settings.chineseVariant,
      };
      this.stream = this.recognizer.createStream(transcribeOpts);

      // Set up PCM chunker for streaming
      this.chunker = new PcmChunker((chunk) => {
        this.stream?.feed(chunk);
      });

      // Reset frame collection
      this.allFrames = [];

      // Create and start capture
      const capture = this.captureFactory.create(settings.deviceId);
      this.capture = capture;
      capture.onFrame((frame) => {
        if (this._state.phase !== "listening") return;

        // Collect Int16 frame for batch fallback
        this.allFrames.push(frame);

        // Feed to streaming chunker
        this.chunker?.push(frame);

        // Compute volume from Int16 samples
        let sum = 0;
        for (let i = 0; i < frame.length; i++) {
          const v = (frame[i] ?? 0) / 32_768;
          sum += v * v;
        }
        const rms = frame.length > 0 ? Math.sqrt(sum / frame.length) : 0;

        // Update volume and duration
        const elapsed = (performance.now() - this.startedAt) / 1000;
        this.setState({
          ...this._state,
          phase: "listening",
          durationSeconds: elapsed,
          volumeLevel: rms,
        });
        this.emit("volumeLevel", rms);
      });

      await capture.start();
      if (abort.signal.aborted) {
        // Cancelled while the device was opening. `cancel()` could not stop a
        // capture that had not started yet, so the device is still ours to
        // release.
        capture.cancel();
        return;
      }
      this.startedAt = performance.now();
      this.setState({ phase: "listening", durationSeconds: 0, volumeLevel: 0 });
    } catch (error) {
      this.cleanup();
      this.settle({
        phase: "error",
        durationSeconds: 0,
        volumeLevel: 0,
        error: error instanceof Error ? error.message : String(error),
        errorCode: errorCodeOf(error),
      });
      throw error;
    }
  }

  /** Stop recording and transcribe the captured audio. */
  async stop(): Promise<VoiceResult> {
    if (this._state.phase !== "listening") {
      throw new Error(`Cannot stop from phase: ${this._state.phase}`);
    }

    const settings = this.getSettings();
    const speechSeconds = (performance.now() - this.startedAt) / 1000;

    this.setState({ ...this._state, phase: "transcribing" });

    try {
      // Stop capture
      if (this.capture) {
        await this.capture.stop();
      }

      // Flush remaining chunks
      this.chunker?.flush();

      const transcribeStart = performance.now();
      let text: string;

      if (this.stream) {
        // Streaming path: finalize the stream
        try {
          text = await this.stream.finalize();
        } catch {
          // Streaming failed, fall back to batch
          text = await this.batchTranscribe(settings);
        }
      } else {
        // Batch path
        text = await this.batchTranscribe(settings);
      }

      const transcribeSeconds = (performance.now() - transcribeStart) / 1000;

      const result: VoiceResult = {
        text,
        speechSeconds,
        transcribeSeconds,
        language: settings.languages[0] ?? "en",
      };

      this.settle({
        phase: "done",
        durationSeconds: speechSeconds,
        volumeLevel: 0,
        result,
      });

      this.cleanup();
      return result;
    } catch (error) {
      this.cleanup();
      this.settle({
        phase: "error",
        durationSeconds: speechSeconds,
        volumeLevel: 0,
        error: error instanceof Error ? error.message : String(error),
        errorCode: errorCodeOf(error),
      });
      throw error;
    }
  }

  /** Cancel recording without transcribing. */
  cancel(): void {
    if (this._state.phase === "idle") return;

    this.setState({ phase: "cancelling", durationSeconds: 0, volumeLevel: 0 });
    this.abort?.abort();
    this.stream?.cancel();

    if (this.capture?.isActive) {
      this.capture.cancel();
    }

    this.cleanup();
    this.setState({ ...INITIAL_STATE });
  }

  /** Release all resources. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.removeAllListeners();
  }

  private async batchTranscribe(settings: VoiceSettings): Promise<string> {
    const pcm = convertFrames(this.allFrames);
    return this.recognizer.transcribe(
      pcm,
      {
        language: settings.languages[0] ?? "en",
        chineseVariant: settings.chineseVariant,
      },
      this.abort?.signal,
    );
  }

  private cleanup(): void {
    this.capture = null;
    this.stream = null;
    this.chunker = null;
    this.allFrames = [];
    this.abort = null;
  }

  private setState(state: VoiceState): void {
    this._state = state;
    this.emit("stateChange", state);
  }

  /**
   * Report a terminal state and leave the controller idle.
   *
   * "done" and "error" end a *session*, not the controller — the next press has
   * to be able to start a new one. Parking the phase there instead made the
   * second attempt fail with "Cannot start from phase: done" (or `: error`
   * after a refused one) until the app restarted, so a user could dictate
   * exactly once. The renderer shows the transcript or the error on its own
   * timer; this is the machine's state, not the notification.
   */
  private settle(state: VoiceState): void {
    this.emit("stateChange", state);
    this._state = { ...INITIAL_STATE };
  }
}

/**
 * Only a recognizer's own errors carry a code. Anything else — a capture
 * failure, a bug — stays code-less so the UI shows its message rather than
 * inventing a translation for a failure nobody anticipated.
 */
function errorCodeOf(error: unknown): VoiceErrorCode | undefined {
  return error instanceof VoiceRecognizerError ? error.code : undefined;
}
