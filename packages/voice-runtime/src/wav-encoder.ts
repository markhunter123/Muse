/**
 * Canonical 44-byte-header RIFF/WAVE encoding for captured PCM.
 *
 * The local whisper path hands `Float32Array` straight to the native model, so
 * this exists for the cloud recognizers, which take a container rather than raw
 * samples. Kept dependency-free and free of native imports so it stays testable.
 */

const HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

/**
 * Encode mono float samples as 16-bit PCM WAV.
 *
 * Samples are clamped before scaling: a captured buffer can carry values
 * slightly outside −1…1 after gain, and letting one wrap would turn a loud
 * syllable into a full-scale click.
 */
export function encodeWav(pcm: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  const byteRate = sampleRate * CHANNELS * (BITS_PER_SAMPLE / 8);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  writeAscii(view, 8, "WAVE");

  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // format 1 = PCM
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, CHANNELS * (BITS_PER_SAMPLE / 8), true); // block align
  view.setUint16(34, BITS_PER_SAMPLE, true);

  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < pcm.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    view.setInt16(HEADER_BYTES + i * 2, Math.round(sample * 32_767), true);
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
