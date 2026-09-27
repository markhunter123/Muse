/**
 * Voice event channels must be the shared constants.
 *
 * They were once ad-hoc strings in the service — "voice:stateChanged",
 * "voice:modelProgress" — while the renderer subscribed to
 * `IPC.event.voiceStateChanged` / `IPC.event.voiceModelProgress`, which are
 * `muse/voice/event/...`. Nothing matched, and `webContents.send` on a channel
 * with no listener fails silently, so the composer never saw a phase, a level,
 * a duration, an error code, or a finished transcript: it only ever saw the
 * rejection of its own `start` call. The feature looked wired and was not.
 *
 * Every other module already sends through `IPC.event.*`, so this pins the one
 * that did not.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const VOICE_SERVICE = new URL(
  "../electron/main/voice-service.ts",
  import.meta.url,
);
const source = readFileSync(VOICE_SERVICE, "utf8");

/**
 * First argument of every `sendToRenderer(...)` call in the file. The method
 * declaration is skipped: its "argument" is a parameter with a type on it.
 */
function sentChannels(text) {
  return [...text.matchAll(/sendToRenderer\(([^,)]+)/g)]
    .map((match) => match[1].trim())
    .filter((argument) => !argument.includes(": "));
}

test("the voice service sends on shared event channels, never literals", () => {
  const channels = sentChannels(source);
  assert.ok(channels.length > 0, "expected at least one sendToRenderer call");
  for (const channel of channels) {
    assert.match(
      channel,
      /^IPC\.event\./,
      `voice service sends on ${channel}; it must be an IPC.event constant so the renderer's subscription matches`,
    );
  }
});

test("both voice events the renderer subscribes to are sent", () => {
  const channels = sentChannels(source);
  assert.ok(
    channels.includes("IPC.event.voiceStateChanged"),
    "voice:stateChanged carries phases, levels, and results to the overlay and the composer",
  );
  assert.ok(
    channels.includes("IPC.event.voiceModelProgress"),
    "voice:modelProgress drives the model download bar in voice settings",
  );
});

test("the channel names the renderer subscribes to are the ones declared in IPC", () => {
  // The other half of the pair: if a constant were renamed on one side only,
  // the send would still be "a constant" and still reach nobody.
  const renderer = readFileSync(
    new URL("../src/features/voice/voice-ipc.ts", import.meta.url),
    "utf8",
  );
  assert.match(renderer, /IPC\.event\.voiceStateChanged/);
  assert.match(renderer, /IPC\.event\.voiceModelProgress/);

  const protocol = readFileSync(
    new URL("../../../packages/shared/src/protocol.ts", import.meta.url),
    "utf8",
  );
  assert.match(protocol, /voiceStateChanged: "muse\/voice\/event\/stateChanged"/);
  assert.match(protocol, /voiceModelProgress: "muse\/voice\/event\/modelProgress"/);
});
