import { describe, it, expect } from "vitest";
import { CAPTURE_SAMPLE_RATE } from "../src/audio-constants.js";
import { encodeWav } from "../src/wav-encoder.js";

function ascii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");
}

describe("encodeWav", () => {
  it("writes a canonical 44-byte mono 16-bit header", () => {
    const pcm = new Float32Array(100);
    const wav = encodeWav(pcm, CAPTURE_SAMPLE_RATE);
    const view = new DataView(wav.buffer);

    expect(wav.byteLength).toBe(44 + 200);
    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(ascii(view, 36, 4)).toBe("data");

    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(CAPTURE_SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(CAPTURE_SAMPLE_RATE * 2); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    // RIFF size counts everything after the first 8 bytes.
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(view.getUint32(40, true)).toBe(200);
  });

  it("scales samples to the full 16-bit range", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16_000);
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32_767);
    expect(view.getInt16(48, true)).toBe(-32_767);
    expect(view.getInt16(50, true)).toBe(Math.round(0.5 * 32_767));
  });

  it("clamps out-of-range samples instead of wrapping them", () => {
    // A single sample past full scale must not fold over into a click.
    const wav = encodeWav(new Float32Array([1.4, -1.4]), 16_000);
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(32_767);
    expect(view.getInt16(46, true)).toBe(-32_767);
  });

  it("encodes an empty capture as a header-only file", () => {
    const wav = encodeWav(new Float32Array(0), 16_000);
    expect(wav.byteLength).toBe(44);
    expect(new DataView(wav.buffer).getUint32(40, true)).toBe(0);
  });

  it("holds one minute of 16 kHz audio inside the 3 MB base64 budget", () => {
    // The bound that actually binds for this app: if it failed, every
    // maximum-length dictation would be rejected by the service.
    const wav = encodeWav(new Float32Array(CAPTURE_SAMPLE_RATE * 60), CAPTURE_SAMPLE_RATE);
    expect(Math.ceil(wav.byteLength / 3) * 4).toBeLessThan(3 * 1024 * 1024);
  });
});
