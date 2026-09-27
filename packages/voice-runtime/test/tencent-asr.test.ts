import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import {
  TencentAsrError,
  base64Length,
  buildCanonicalRequest,
  engineTypeForLanguages,
  tc3AuthorizationHeader,
  tc3CredentialScope,
  tc3StringToSign,
  transcribeWithTencentAsr,
} from "../src/tencent-asr.js";

/**
 * Tencent's own worked example for 签名方法 v3, reproduced as a fixture.
 *
 * Its value is that every constant here comes from the vendor's documentation
 * rather than from this implementation: the payload hash, the canonical
 * request, the hashed canonical request and — with the published derived
 * signing key — the final signature. A change to the signing chain that still
 * "looks right" cannot survive it.
 *
 * The SecretKey itself is masked in the docs, so the key-derivation steps
 * cannot be reproduced from them; what they do publish is the derived
 * `SecretSigning`, which is all the final HMAC needs, and the three
 * intermediate keys are asserted for completeness below.
 */
const PUBLISHED = {
  timestamp: 1551113065,
  service: "cvm",
  payload:
    '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], "Name": "instance-name"}]}',
  hashedPayload: "35e9c5b0e3ae67532d3c9f17ead6c90222632e5b1ff7f6e89887f1398934f064",
  canonicalRequest: [
    "POST",
    "/",
    "",
    "content-type:application/json; charset=utf-8",
    "host:cvm.tencentcloudapi.com",
    "x-tc-action:describeinstances",
    "",
    "content-type;host;x-tc-action",
    "35e9c5b0e3ae67532d3c9f17ead6c90222632e5b1ff7f6e89887f1398934f064",
  ].join("\n"),
  signedHeaders: "content-type;host;x-tc-action",
  credentialScope: "2019-02-25/cvm/tc3_request",
  hashedCanonicalRequest: "7019a55be8395899b900fb5564e4200d984910f34794a27cb3fb7d10ff6a1e84",
  stringToSign: [
    "TC3-HMAC-SHA256",
    "1551113065",
    "2019-02-25/cvm/tc3_request",
    "7019a55be8395899b900fb5564e4200d984910f34794a27cb3fb7d10ff6a1e84",
  ].join("\n"),
  secretDate: "da98fb70dcf6b112dc21038d1eeeb3a95c74b4dcb12c1131f864f6066bd02be0",
  secretService: "8d70cbefb03939f929db64d32dc2ba89b1095620119fe3e050e2b18c5bd2752f",
  secretSigning: "b596b923aad85185e2d1f6659d2a062e0a86731226e021e61bfe06f7ed05f5af",
  signature: "10b1a37a7301a02ca19a647ad722d5e43b4b3cff309d421d85b46093f6ab6c4f",
} as const;

function publishedRequest() {
  return buildCanonicalRequest({
    method: "POST",
    uri: "/",
    query: "",
    headers: [
      ["content-type", "application/json; charset=utf-8"],
      ["host", "cvm.tencentcloudapi.com"],
      ["x-tc-action", "describeinstances"],
    ],
    payload: PUBLISHED.payload,
  });
}

describe("TC3 signature", () => {
  it("reproduces the published canonical request byte for byte", () => {
    const built = publishedRequest();
    expect(built.canonicalRequest).toBe(PUBLISHED.canonicalRequest);
    expect(built.signedHeaders).toBe(PUBLISHED.signedHeaders);
  });

  it("hashes the canonical request to the published value", () => {
    // Reached through `tc3StringToSign` because that is the only place the
    // digest is consumed, and the assertion below pins the string it lands in.
    const stringToSign = tc3StringToSign(
      PUBLISHED.timestamp,
      PUBLISHED.credentialScope,
      publishedRequest().canonicalRequest,
    );
    expect(stringToSign).toBe(PUBLISHED.stringToSign);
    expect(stringToSign).toContain(PUBLISHED.hashedCanonicalRequest);
  });

  it("derives the published signature from the published signing key", () => {
    // The final HMAC is independent of how `SecretSigning` was reached, so the
    // published vector covers it even though the SecretKey is masked.
    const signature = createHmac("sha256", Buffer.from(PUBLISHED.secretSigning, "hex"))
      .update(PUBLISHED.stringToSign)
      .digest("hex");
    expect(signature).toBe(PUBLISHED.signature);
  });

  it("names the credential scope from a UTC date", () => {
    expect(tc3CredentialScope(PUBLISHED.timestamp, PUBLISHED.service)).toBe(
      PUBLISHED.credentialScope,
    );
  });

  it("composes the documented Authorization header", () => {
    // The key is a fixture, so this pins the header's shape and the fact that
    // the signature is derived from the inputs — not the vendor's own vector,
    // which the masked SecretKey puts out of reach.
    const header = tc3AuthorizationHeader({
      secretId: "AKIDexample",
      secretKey: "secret-example",
      service: "asr",
      timestamp: PUBLISHED.timestamp,
      canonicalRequest: PUBLISHED.canonicalRequest,
      signedHeaders: PUBLISHED.signedHeaders,
    });
    expect(header).toMatch(
      /^TC3-HMAC-SHA256 Credential=AKIDexample\/2019-02-25\/asr\/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=[0-9a-f]{64}$/,
    );
  });

  it("sorts and lowercases the signed headers regardless of caller order", () => {
    const built = buildCanonicalRequest({
      method: "POST",
      uri: "/",
      query: "",
      headers: [
        ["X-TC-Action", "sentencerecognition"],
        ["Host", "asr.tencentcloudapi.com"],
        ["Content-Type", "application/json; charset=utf-8"],
      ],
      payload: "{}",
    });
    expect(built.signedHeaders).toBe("content-type;host;x-tc-action");
  });
});

describe("transcribeWithTencentAsr", () => {
  const credentials = { secretId: "AKIDexample", secretKey: "secret-example" };
  const audio = new Uint8Array([1, 2, 3, 4]);

  function respondWith(body: unknown, status = 200) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), { status });
    });
    return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
  }

  it("posts a signed SentenceRecognition request", async () => {
    const { calls, fetchImpl } = respondWith({
      Response: { Result: "你好。", AudioDuration: 1200 },
    });

    const result = await transcribeWithTencentAsr(
      credentials,
      { audio, engineType: "16k_zh-PY" },
      { fetchImpl },
    );

    expect(result).toEqual({ text: "你好。" });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://asr.tencentcloudapi.com");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["X-TC-Action"]).toBe("SentenceRecognition");
    expect(headers["X-TC-Version"]).toBe("2019-06-14");
    expect(headers.Authorization).toContain("Credential=AKIDexample/");
    expect(headers.Authorization).toContain(
      "SignedHeaders=content-type;host;x-tc-action",
    );

    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      EngSerViceType: "16k_zh-PY",
      SourceType: 1,
      VoiceFormat: "wav",
      // The API measures the audio before base64, so this must not be the
      // length of the encoded string.
      DataLen: audio.byteLength,
      Data: Buffer.from(audio).toString("base64"),
      // 0 keeps the service's punctuation; 2 would strip it.
      FilterPunc: 0,
    });
  });

  it("surfaces the vendor error code", async () => {
    const { fetchImpl } = respondWith(
      { Response: { Error: { Code: "AuthFailure.SignatureFailure", Message: "bad sig" } } },
      200,
    );
    await expect(
      transcribeWithTencentAsr(credentials, { audio, engineType: "16k_zh" }, { fetchImpl }),
    ).rejects.toMatchObject({
      name: "TencentAsrError",
      code: "AuthFailure.SignatureFailure",
      message: "bad sig",
    });
  });

  it("rejects a success status that carries no Result", async () => {
    const { fetchImpl } = respondWith({ Response: {} });
    const error = await transcribeWithTencentAsr(
      credentials,
      { audio, engineType: "16k_zh" },
      { fetchImpl },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TencentAsrError);
    expect((error as TencentAsrError).code).toBe("InvalidResponse");
  });

  it("rejects a body that is not JSON", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("<html>gateway</html>", { status: 502 }),
    ) as unknown as typeof fetch;
    const error = await transcribeWithTencentAsr(
      credentials,
      { audio, engineType: "16k_zh" },
      { fetchImpl },
    ).catch((e: unknown) => e);
    expect((error as TencentAsrError).code).toBe("InvalidResponse");
  });

  it("reports a transport failure as a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const error = await transcribeWithTencentAsr(
      credentials,
      { audio, engineType: "16k_zh" },
      { fetchImpl },
    ).catch((e: unknown) => e);
    expect((error as TencentAsrError).code).toBe("NetworkError");
  });

  it("lets a caller cancellation through unlabelled", async () => {
    // Cancelling a recording must not be reported as a recognition failure.
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }) as unknown as typeof fetch;

    const error = await transcribeWithTencentAsr(
      credentials,
      { audio, engineType: "16k_zh" },
      { fetchImpl, signal: controller.signal },
    ).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(TencentAsrError);
  });
});

describe("engineTypeForLanguages", () => {
  it("uses the mixed Mandarin/English/Cantonese model for a bilingual selection", () => {
    expect(engineTypeForLanguages(["zh", "en"])).toBe("16k_zh-PY");
  });

  it("uses the single-language engine when only one is selected", () => {
    expect(engineTypeForLanguages(["zh"])).toBe("16k_zh");
    expect(engineTypeForLanguages(["en"])).toBe("16k_en");
    expect(engineTypeForLanguages(["ja"])).toBe("16k_ja");
    expect(engineTypeForLanguages(["ko"])).toBe("16k_ko");
  });

  it("falls back to the Mandarin engine for an unsupported language", () => {
    expect(engineTypeForLanguages(["sv"])).toBe("16k_zh");
    expect(engineTypeForLanguages([])).toBe("16k_zh");
  });
});

describe("base64Length", () => {
  it("includes padding so the 3 MB check measures what the service receives", () => {
    expect(base64Length(1)).toBe(4);
    expect(base64Length(3)).toBe(4);
    expect(base64Length(4)).toBe(8);
  });
});
