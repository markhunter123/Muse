import { describe, it, expect, vi } from "vitest";
import { CAPTURE_SAMPLE_RATE } from "../src/audio-constants.js";
import { TencentAsrRecognizer } from "../src/tencent-recognizer.js";
import type { VoiceSettings } from "../src/types.js";

const CREDENTIALS = { secretId: "AKIDexample", secretKey: "secret-example" };

function settings(overrides: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    enabled: true,
    deviceId: null,
    languages: ["zh", "en"],
    chineseVariant: "simplified",
    modelId: "",
    provider: "tencent",
    ...overrides,
  };
}

/** Captures the request bodies the recognizer sends, and answers with `text`. */
function createFetch(text = "你好。") {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ Response: { Result: text } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { bodies, fetchImpl };
}

describe("TencentAsrRecognizer", () => {
  it("refuses to start without credentials", async () => {
    const recognizer = new TencentAsrRecognizer({ readCredentials: async () => null });
    await expect(recognizer.prepare(settings())).rejects.toMatchObject({
      code: "credentialsMissing",
    });
  });

  it("refuses to transcribe without credentials", async () => {
    const recognizer = new TencentAsrRecognizer({ readCredentials: async () => null });
    await expect(
      recognizer.transcribe(new Float32Array(1600), { language: "zh" }),
    ).rejects.toMatchObject({ code: "credentialsMissing" });
  });

  it("has no partial-result stream, so the controller uses whole buffers", () => {
    const recognizer = new TencentAsrRecognizer({ readCredentials: async () => CREDENTIALS });
    expect(recognizer.createStream({ language: "zh" })).toBeNull();
  });

  it("refuses audio past the one-shot API's 60 second ceiling", async () => {
    const { fetchImpl, bodies } = createFetch();
    const recognizer = new TencentAsrRecognizer({
      readCredentials: async () => CREDENTIALS,
      fetchImpl,
    });

    const tooLong = new Float32Array(CAPTURE_SAMPLE_RATE * 61);
    await expect(
      recognizer.transcribe(tooLong, { language: "zh" }),
    ).rejects.toMatchObject({ code: "audioTooLong" });
    // Refused locally: the user should not wait on a round trip to hear no.
    expect(bodies).toHaveLength(0);
  });

  it("accepts audio at exactly the ceiling", async () => {
    const { fetchImpl } = createFetch();
    const recognizer = new TencentAsrRecognizer({
      readCredentials: async () => CREDENTIALS,
      fetchImpl,
    });
    const atLimit = new Float32Array(CAPTURE_SAMPLE_RATE * 60);
    await expect(recognizer.transcribe(atLimit, { language: "zh" })).resolves.toBe("你好。");
  });

  it("picks the mixed engine for the languages seen at prepare time", async () => {
    const { fetchImpl, bodies } = createFetch();
    const recognizer = new TencentAsrRecognizer({
      readCredentials: async () => CREDENTIALS,
      fetchImpl,
    });

    await recognizer.prepare(settings({ languages: ["zh", "en"] }));
    await recognizer.transcribe(new Float32Array(1600), { language: "zh" });
    expect(bodies[0]?.EngSerViceType).toBe("16k_zh-PY");

    await recognizer.prepare(settings({ languages: ["en"] }));
    await recognizer.transcribe(new Float32Array(1600), { language: "en" });
    expect(bodies[1]?.EngSerViceType).toBe("16k_en");
  });

  it("falls back to the transcribe language when prepare never ran", async () => {
    // `TranscribeOptions` carries only the primary language, so this is the
    // only signal available — and it must not silently become Mandarin for an
    // English-only user.
    const { fetchImpl, bodies } = createFetch();
    const recognizer = new TencentAsrRecognizer({
      readCredentials: async () => CREDENTIALS,
      fetchImpl,
    });

    await recognizer.transcribe(new Float32Array(1600), { language: "ja" });
    expect(bodies[0]?.EngSerViceType).toBe("16k_ja");
  });

  it("sends the captured audio as a WAV of the capture length", async () => {
    const { fetchImpl, bodies } = createFetch();
    const recognizer = new TencentAsrRecognizer({
      readCredentials: async () => CREDENTIALS,
      fetchImpl,
    });

    await recognizer.transcribe(new Float32Array(1600), { language: "zh" });
    const body = bodies[0]!;
    // 1600 samples at 16 kHz: one tenth of a second, plus the 44-byte header.
    expect(body.DataLen).toBe(44 + 1600 * 2);
    expect(body.VoiceFormat).toBe("wav");
  });

  it("converts the transcript into the configured Chinese variant", async () => {
    const { fetchImpl } = createFetch("漢字發音");
    const recognizer = new TencentAsrRecognizer({
      readCredentials: async () => CREDENTIALS,
      fetchImpl,
    });

    await expect(
      recognizer.transcribe(new Float32Array(1600), {
        language: "zh",
        chineseVariant: "simplified",
      }),
    ).resolves.toBe("汉字发音");
  });

  it("groups an expired key as an auth failure, so the UI points at the field", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            Response: { Error: { Code: "AuthFailure.TokenFailure", Message: "expired" } },
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const recognizer = new TencentAsrRecognizer({
      readCredentials: async () => CREDENTIALS,
      fetchImpl,
    });

    await expect(
      recognizer.transcribe(new Float32Array(1600), { language: "zh" }),
    ).rejects.toMatchObject({ code: "authFailed" });
  });

  it("keeps a vendor failure's code in the message for the log", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            Response: { Error: { Code: "LimitExceeded.TooManyRequests", Message: "slow down" } },
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const recognizer = new TencentAsrRecognizer({
      readCredentials: async () => CREDENTIALS,
      fetchImpl,
    });

    await expect(
      recognizer.transcribe(new Float32Array(1600), { language: "zh" }),
    ).rejects.toMatchObject({
      code: "requestFailed",
      message: "LimitExceeded.TooManyRequests: slow down",
    });
  });
});
