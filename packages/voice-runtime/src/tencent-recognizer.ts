/**
 * Cloud recognizer backed by Tencent Cloud one-shot recognition.
 *
 * Sits behind {@link SpeechRecognizer} alongside the bundled whisper engine, so
 * the controller and the UI are identical whichever one is configured.
 *
 * Credential *storage* is deliberately not this module's business: it takes a
 * reader, so the Electron main process can supply a host-core lookup while this
 * package stays free of any host dependency, and a test can supply a literal.
 */

import { CAPTURE_SAMPLE_RATE } from "./audio-constants.js";
import { convertChineseOutput, isChineseLanguage } from "./chinese.js";
import {
  TENCENT_ASR_MAX_BASE64_BYTES,
  TENCENT_ASR_MAX_SECONDS,
  TencentAsrError,
  base64Length,
  engineTypeForLanguages,
  transcribeWithTencentAsr,
  type TencentAsrCredentials,
} from "./tencent-asr.js";
import {
  VoiceRecognizerError,
  type SpeechRecognizer,
  type TranscribeOptions,
  type TranscriptionStream,
  type VoiceSettings,
} from "./types.js";
import { encodeWav } from "./wav-encoder.js";

export interface TencentRecognizerOptions {
  /** Resolves the stored credential pair, or null when the user has not set it. */
  readCredentials: () => Promise<TencentAsrCredentials | null>;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class TencentAsrRecognizer implements SpeechRecognizer {
  /**
   * Languages from the last `prepare`. `TranscribeOptions` carries only the
   * primary language, but the engine choice depends on the whole selection:
   * a Chinese *and* English user wants the mixed model, not the Mandarin one.
   */
  private languages: readonly string[] | null = null;

  constructor(private readonly options: TencentRecognizerOptions) {}

  async prepare(settings: VoiceSettings): Promise<void> {
    // Checked before the microphone opens rather than after the user has
    // finished talking, so an unconfigured account costs a click and not a
    // lost sentence.
    const credentials = await this.options.readCredentials();
    if (!credentials) {
      throw new VoiceRecognizerError(
        "credentialsMissing",
        "Tencent Cloud SecretId/SecretKey are not configured",
      );
    }
    this.languages = [...settings.languages];
  }

  createStream(_options: TranscribeOptions): TranscriptionStream | null {
    // `SentenceRecognition` is one-shot: there is no partial-result stream to
    // feed, so the controller falls back to transcribing the whole buffer.
    return null;
  }

  async transcribe(
    pcm: Float32Array,
    options: TranscribeOptions,
    signal?: AbortSignal,
  ): Promise<string> {
    const credentials = await this.options.readCredentials();
    if (!credentials) {
      throw new VoiceRecognizerError(
        "credentialsMissing",
        "Tencent Cloud SecretId/SecretKey are not configured",
      );
    }

    const seconds = pcm.length / CAPTURE_SAMPLE_RATE;
    if (seconds > TENCENT_ASR_MAX_SECONDS) {
      throw new VoiceRecognizerError(
        "audioTooLong",
        `Recording is ${seconds.toFixed(1)}s; the one-shot API accepts at most ${TENCENT_ASR_MAX_SECONDS}s`,
      );
    }

    const wav = encodeWav(pcm, CAPTURE_SAMPLE_RATE);
    if (base64Length(wav.byteLength) > TENCENT_ASR_MAX_BASE64_BYTES) {
      throw new VoiceRecognizerError(
        "audioTooLarge",
        `Encoded recording is ${base64Length(wav.byteLength)} bytes; the one-shot API accepts at most ${TENCENT_ASR_MAX_BASE64_BYTES}`,
      );
    }

    let text: string;
    try {
      const result = await transcribeWithTencentAsr(
        credentials,
        {
          audio: wav,
          engineType: engineTypeForLanguages(this.languages ?? [options.language]),
        },
        { fetchImpl: this.options.fetchImpl, signal },
      );
      text = result.text;
    } catch (error) {
      // A cancellation is not a failure of the request, so it must not be
      // relabelled as one — the caller is already unwinding the session.
      if (signal?.aborted) throw error;
      throw toRecognizerError(error);
    }

    if (text && options.chineseVariant && isChineseLanguage(options.language)) {
      try {
        text = await convertChineseOutput(text, options.chineseVariant);
      } catch {
        // Variant conversion is cosmetic; the transcript itself is still good.
      }
    }

    return text;
  }

  shutdown(): void {
    // Nothing held: each request is a fresh signed call.
  }
}

/**
 * Tencent reports an expired or wrong key as `AuthFailure.*`; grouping those
 * lets the UI send the user to the credential field instead of showing them a
 * raw vendor code. Everything else is a request-level failure.
 */
function toRecognizerError(error: unknown): VoiceRecognizerError {
  if (error instanceof TencentAsrError && error.code.startsWith("AuthFailure")) {
    return new VoiceRecognizerError("authFailed", error.message);
  }
  if (error instanceof TencentAsrError) {
    return new VoiceRecognizerError("requestFailed", `${error.code}: ${error.message}`);
  }
  return new VoiceRecognizerError(
    "requestFailed",
    error instanceof Error ? error.message : String(error),
  );
}
