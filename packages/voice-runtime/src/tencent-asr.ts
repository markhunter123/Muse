/**
 * Tencent Cloud one-shot recognition — the `SentenceRecognition` API 3.0
 * action, signed with TC3-HMAC-SHA256.
 *
 * Hand-rolled rather than pulling in `tencentcloud-sdk-nodejs`: one action,
 * one request shape, and the signing chain is a few lines of `node:crypto`.
 * The endpoint is a fixed app-owned host, so unlike a user-supplied base URL
 * there is no origin to validate before the credential travels.
 *
 * `fetchImpl` is injectable so signing and response mapping are testable
 * without network access.
 *
 * API: https://cloud.tencent.com/document/product/1093/35646
 * Signature: https://cloud.tencent.com/document/api/1093/35640
 */

import { createHash, createHmac } from "node:crypto";

const ENDPOINT = "https://asr.tencentcloudapi.com";
const HOST = "asr.tencentcloudapi.com";
const SERVICE = "asr";
const ACTION = "SentenceRecognition";
const VERSION = "2019-06-14";
const REQUEST_TIMEOUT_MS = 60_000;

export interface TencentAsrCredentials {
  readonly secretId: string;
  readonly secretKey: string;
}

export interface TencentAsrInput {
  /** 16 kHz / 16-bit / mono WAV bytes. */
  readonly audio: Uint8Array;
  /** `EngSerViceType`; see `engineTypeForLanguages`. */
  readonly engineType: string;
}

export interface TencentAsrResult {
  readonly text: string;
}

/**
 * Carries the vendor's error code so callers can classify a failure without
 * matching on prose. Codes are Tencent's own (`AuthFailure.*`,
 * `LimitExceeded.*`, …) plus four this client raises itself.
 */
export class TencentAsrError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TencentAsrError";
    this.code = code;
  }
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** `YYYY-MM-DD` in UTC — the signature scope's date, not the local one. */
function tc3Date(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export interface CanonicalRequestInput {
  readonly method: string;
  readonly uri: string;
  /** Raw query string without the leading `?`; empty when the body carries everything. */
  readonly query: string;
  readonly headers: ReadonlyArray<readonly [name: string, value: string]>;
  /** Request body, hashed as-is. */
  readonly payload: string;
}

export interface CanonicalRequest {
  readonly canonicalRequest: string;
  readonly signedHeaders: string;
}

/**
 * The TC3 canonical request, per
 * https://cloud.tencent.com/document/api/1093/35640.
 *
 * Headers are lowercased and sorted because the signature covers them in that
 * form — a caller that passes them in another order still signs what the
 * server will reconstruct.
 */
export function buildCanonicalRequest(input: CanonicalRequestInput): CanonicalRequest {
  const sorted = [...input.headers]
    .map(([name, value]) => [name.toLowerCase(), value.trim()] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalHeaders = sorted.map(([name, value]) => `${name}:${value}\n`).join("");
  const signedHeaders = sorted.map(([name]) => name).join(";");

  // The blank line after the headers is not a typo: `canonicalHeaders` already
  // ends each entry with `\n`, and the spec separates sections with another.
  const canonicalRequest = [
    input.method,
    input.uri,
    input.query,
    canonicalHeaders,
    signedHeaders,
    sha256Hex(input.payload),
  ].join("\n");

  return { canonicalRequest, signedHeaders };
}

export interface Tc3AuthorizationInput {
  readonly secretId: string;
  readonly secretKey: string;
  readonly service: string;
  /** Unix seconds. Also part of the signature, so it cannot be re-derived later. */
  readonly timestamp: number;
  readonly canonicalRequest: string;
  readonly signedHeaders: string;
}

/** The scope a timestamp and service resolve to, e.g. `2019-02-25/cvm/tc3_request`. */
export function tc3CredentialScope(timestamp: number, service: string): string {
  return `${tc3Date(timestamp)}/${service}/tc3_request`;
}

export function tc3StringToSign(
  timestamp: number,
  credentialScope: string,
  canonicalRequest: string,
): string {
  return (
    `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n` + sha256Hex(canonicalRequest)
  );
}

export function tc3AuthorizationHeader(input: Tc3AuthorizationInput): string {
  const credentialScope = tc3CredentialScope(input.timestamp, input.service);
  const stringToSign = tc3StringToSign(
    input.timestamp,
    credentialScope,
    input.canonicalRequest,
  );

  // The documented key derivation: date, then service, then the fixed
  // `tc3_request` terminator. `kSigning` is never transmitted.
  const kDate = hmacSha256(`TC3${input.secretKey}`, tc3Date(input.timestamp));
  const kService = hmacSha256(kDate, input.service);
  const kSigning = hmacSha256(kService, "tc3_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return (
    `TC3-HMAC-SHA256 Credential=${input.secretId}/${credentialScope}, ` +
    `SignedHeaders=${input.signedHeaders}, Signature=${signature}`
  );
}

export interface TranscribeWithTencentAsrOptions {
  readonly fetchImpl?: typeof fetch;
  /** Caller budget. Aborting it rejects rather than surfacing as a timeout. */
  readonly signal?: AbortSignal;
}

export async function transcribeWithTencentAsr(
  credentials: TencentAsrCredentials,
  input: TencentAsrInput,
  options: TranscribeWithTencentAsrOptions = {},
): Promise<TencentAsrResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const payload = JSON.stringify({
    EngSerViceType: input.engineType,
    SourceType: 1,
    VoiceFormat: "wav",
    Data: Buffer.from(input.audio).toString("base64"),
    // Length of the audio *before* base64, per the API contract.
    DataLen: input.audio.byteLength,
    // 0 is "do not filter": the composer wants the service's punctuation.
    // (2 would strip sentence-final *and* mid-sentence marks.)
    FilterPunc: 0,
    // 1 is the documented default, pinned here so dictated numbers land as
    // Arabic numerals rather than Chinese characters.
    ConvertNumMode: 1,
  });

  const timestamp = Math.floor(Date.now() / 1000);

  // The Host header is signed here but supplied by the HTTP stack from the URL;
  // omitting it from the request headers is why the two lists are built apart.
  const { canonicalRequest, signedHeaders } = buildCanonicalRequest({
    method: "POST",
    uri: "/",
    query: "",
    headers: [
      ["content-type", "application/json; charset=utf-8"],
      ["host", HOST],
      ["x-tc-action", ACTION.toLowerCase()],
    ],
    payload,
  });

  const authorization = tc3AuthorizationHeader({
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    service: SERVICE,
    timestamp,
    canonicalRequest,
    signedHeaders,
  });

  // The request needs both a deadline and the caller's cancellation. `any`
  // keeps whichever fires first, and the catch below tells them apart by
  // asking the caller's own signal rather than by inspecting the reason.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-TC-Action": ACTION,
        "X-TC-Version": VERSION,
        "X-TC-Timestamp": String(timestamp),
        Authorization: authorization,
      },
      body: payload,
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (timeout.aborted) {
      throw new TencentAsrError(
        "TimeoutError",
        `Tencent Cloud ASR did not answer within ${REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }
    throw new TencentAsrError(
      "NetworkError",
      error instanceof Error ? error.message : String(error),
    );
  }

  const bodyText = await response.text();
  let parsed: {
    Response?: {
      Result?: unknown;
      Error?: { Code?: unknown; Message?: unknown };
    };
  };
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new TencentAsrError(
      "InvalidResponse",
      `Unexpected ASR response (HTTP ${response.status})`,
    );
  }

  const result = parsed.Response;
  if (result?.Error) {
    throw new TencentAsrError(
      typeof result.Error.Code === "string" ? result.Error.Code : "Unknown",
      typeof result.Error.Message === "string" ? result.Error.Message : "Unknown ASR error",
    );
  }
  if (typeof result?.Result !== "string") {
    throw new TencentAsrError(
      "InvalidResponse",
      `ASR response missing Result (HTTP ${response.status})`,
    );
  }

  return { text: result.Result.trim() };
}

/** Non-phone engine ids offered by `SentenceRecognition`, by language code. */
const ENGINE_TYPE_BY_LANGUAGE: Record<string, string> = {
  zh: "16k_zh",
  en: "16k_en",
  ja: "16k_ja",
  ko: "16k_ko",
};

/**
 * `16k_zh-PY` recognizes Mandarin, English and Cantonese in one pass, which is
 * what a bilingual speaker actually produces — a Chinese sentence with English
 * product names in it. A single selected language uses its own engine, because
 * the mixed model trades some monolingual accuracy for that coverage.
 */
export function engineTypeForLanguages(languages: readonly string[]): string {
  if (languages.length > 1) return "16k_zh-PY";
  const [language] = languages;
  return (language && ENGINE_TYPE_BY_LANGUAGE[language]) ?? "16k_zh";
}

/** Audio duration the one-shot API accepts, in seconds. */
export const TENCENT_ASR_MAX_SECONDS = 60;

/**
 * Audio size the one-shot API accepts, in bytes — of the **base64** payload,
 * which is what the service measures. 60 s of 16 kHz/16-bit mono is 2.56 MB
 * encoded, so the duration cap is the binding one for audio this app records;
 * this bound exists so a caller feeding a different format cannot slip past.
 */
export const TENCENT_ASR_MAX_BASE64_BYTES = 3 * 1024 * 1024;

/** Base64 length of `byteLength` raw bytes, including padding. */
export function base64Length(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}
