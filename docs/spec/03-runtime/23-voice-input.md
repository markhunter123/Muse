# 23. Voice Input

Composer dictation: hold right Alt (or click the mic) to record, release to
transcribe, and the text lands in the draft. This is separate from
[20-speech.md](20-speech.md), which binds provider-owned ASR/TTS for the host
speech surface and is not a Settings destination.

## 1. Ownership

| Concern | Owner |
|---|---|
| capture, chunking, session state machine | `packages/voice-runtime` |
| local whisper inference | `packages/voice-runtime` (`transcribe-cpp`) |
| cloud signing and request shape | `packages/voice-runtime` (`tencent-asr.ts`) |
| microphone access, process lifecycle | Electron main (`voice-service.ts`) |
| credential storage | Rust host-core ([14-secrets-storage.md](14-secrets-storage.md)) |
| renderer knowledge | phase, levels, and whether a credential is configured |

The renderer never holds a credential value: it has `muse/voice/setCredentials`
and `muse/voice/credentialStatus`, and deliberately no read channel. The status
call answers `hasSecretId` / `hasSecretKey` booleans, never the values.

Main → renderer traffic goes over exactly two `IPC.event` channels:
`muse/voice/event/stateChanged` and `muse/voice/event/modelProgress`. They are
the only way the renderer learns a phase, a level, a duration, an error code, or
a finished transcript — a `webContents.send` on a channel nobody subscribes to
fails silently, and the composer would then see only the rejection of its own
`start` call. `apps/desktop/test/voice-channel-wiring.test.mjs` pins the pair so
a literal on either side cannot reopen that hole.

## 2. Recognizer port

`VoiceController` drives a `SpeechRecognizer`, not a concrete engine:

```ts
interface SpeechRecognizer {
  prepare(settings: VoiceSettings): Promise<void>;
  createStream(options: TranscribeOptions): TranscriptionStream | null;
  transcribe(pcm: Float32Array, options: TranscribeOptions, signal?: AbortSignal): Promise<string>;
  shutdown(): Promise<void> | void;
}
```

`prepare` exists because both recognizers have a precondition that must be
answered **before the microphone opens** — the local engine needs a model
loaded, the cloud engine needs a credential stored. Failing after the user has
finished speaking would cost them the sentence.

`createStream` returning `null` is the whole streaming contract: the local
whisper models support partial results, and the one-shot cloud API has none, so
the controller falls back to transcribing the whole captured buffer. No caller
branches on the provider.

Two implementations:

| provider | recognizer | precondition | partial results |
|---|---|---|---|
| `local` | `TranscriptionEngine` (`transcribe-cpp`) | a catalog model is downloaded and selected | yes, model-dependent |
| `tencent` | `TencentAsrRecognizer` | SecretId and SecretKey are stored | no |

## 3. Tencent Cloud one-shot recognition

`SentenceRecognition`, API version `2019-06-14`, signed with TC3-HMAC-SHA256.
Hand-rolled over `node:crypto` rather than the vendor SDK: one action, one
request shape. The endpoint is a fixed app-owned host, so there is no
user-supplied origin to validate before the credential travels.

Captured audio is 16 kHz mono `Float32Array`; it is encoded as 16-bit PCM WAV
before base64, because the API takes a container rather than raw samples.

### Engine selection

`EngSerViceType` follows the configured language list, not just its first entry:

| selection | engine |
|---|---|
| more than one language | `16k_zh-PY` — Mandarin, English and Cantonese in one pass |
| `zh` / `en` / `ja` / `ko` alone | `16k_zh` / `16k_en` / `16k_ja` / `16k_ko` |
| anything else | `16k_zh` |

The mixed model is the default because a bilingual speaker produces Chinese
sentences containing English words, which a monolingual engine mangles.

### Limits

The API accepts at most **60 seconds** and **3 MB of base64 payload**. 60 s of
16 kHz/16-bit mono encodes to 2.56 MB, so the duration cap is the binding one
for audio this app records; the size bound exists so a caller feeding another
format cannot slip past. Both are enforced locally with a coded error
(§4) rather than by waiting on a round trip to be refused.

## 4. Failure codes

A refused session carries `errorCode` alongside the human-readable `error`.
The UI translates a code it has copy for and otherwise shows the recognizer's
own message, so an unanticipated failure says something rather than nothing.

| code | raised when |
|---|---|
| `noModel` | `local` selected with no model chosen |
| `credentialsMissing` | `tencent` selected with no stored pair |
| `audioTooLong` | recording exceeded 60 s |
| `audioTooLarge` | encoded payload exceeded 3 MB |
| `authFailed` | the service answered `AuthFailure.*` |
| `requestFailed` | any other vendor or transport failure |

Cancellation is not a failure: an aborted request propagates as an abort and is
never relabelled with a code.

## 5. Settings

`AppSettings.voice` is `VoiceInputSettings`, and an absent block means the
defaults in `DEFAULT_VOICE_INPUT_SETTINGS` — **enabled, `provider: "tencent"`**.
Read it through `resolveVoiceInputSettings` rather than testing for truthiness.

Electron main seeds its `VoiceService` settings from `settings.get` on first
use. The renderer pushes settings only when the settings page is edited, so
without that seed the first dictation after a cold start would run on the
service's fallback values.

The settings panel shows the credential form for `tencent` and the model
picker for `local`, never both: configuring the recognizer that is not running
is the failure mode the split exists to avoid.

## 6. Acceptance criteria

- [x] a stored pair reads back only through `secrets.getForRuntime`, which is
      main-only
- [x] `write` returns nothing a caller could render
- [x] status reports presence per field without reading values
- [x] signing reproduces the vendor's published TC3 vector
- [x] the canonical request matches the vendor's published example byte for byte
- [x] a recording past 60 s is refused before any request is sent
- [x] an aborted request is not reported as a recognition failure
- [x] a refused session reaches the UI as a coded, localized message rather
      than as the raw diagnostic
- [x] both state channels are shared constants, checked on each side
