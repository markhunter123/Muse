// Types
export type {
  VoicePhase,
  VoiceState,
  VoiceResult,
  VoiceSettings,
  VoiceProvider,
  ChineseVariant,
  SpeechRecognizer,
  ModelInfo,
  ModelStatus,
  ModelState,
  AudioInputDevice,
  AudioCapture,
  AudioCaptureFactory,
  TranscribeOptions,
  TranscriptionStream,
} from "./types.js";
export { VoiceRecognizerError } from "./types.js";

// Constants
export { CAPTURE_SAMPLE_RATE, FRAME_LENGTH, STREAM_CHUNK_SAMPLES } from "./audio-constants.js";

// Core classes
export { VoiceController } from "./voice-controller.js";
export { TranscriptionEngine } from "./transcription-engine.js";
export { ModelManager } from "./model-manager.js";
export { TencentAsrRecognizer } from "./tencent-recognizer.js";
export type { TencentRecognizerOptions } from "./tencent-recognizer.js";

// Cloud recognizer
export {
  transcribeWithTencentAsr,
  engineTypeForLanguages,
  TencentAsrError,
  TENCENT_ASR_MAX_SECONDS,
  TENCENT_ASR_MAX_BASE64_BYTES,
} from "./tencent-asr.js";
export type { TencentAsrCredentials } from "./tencent-asr.js";

// Utilities
export { PcmChunker } from "./pcm-chunker.js";
export { convertFrames, computeRms } from "./pcm-utils.js";
export { encodeWav } from "./wav-encoder.js";
export { isChineseLanguage, convertChineseOutput } from "./chinese.js";
export { SUPPORTED_LANGUAGES, languageLabel } from "./languages.js";
export { getCatalog, findModel, getRecommendedModel } from "./model-catalog.js";
