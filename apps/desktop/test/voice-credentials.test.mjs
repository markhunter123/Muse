/**
 * The Tencent Cloud credential store's contract.
 *
 * Two things are worth pinning. The ref names are the only handle on values
 * that already exist on users' disks — host-core stores a secret under
 * `sha256(ref)` and cannot tell one from another, so renaming one silently
 * orphans whatever the user saved. And the store must reach host-core only
 * through `secrets.*`: the renderer has no read channel by design, and a store
 * that grew one would be the way that boundary quietly breaks.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  VOICE_TENCENT_SECRET_ID_REF,
  VOICE_TENCENT_SECRET_KEY_REF,
  createVoiceCredentialStore,
} from "../electron/main/voice-credentials.ts";

/** An in-memory stand-in for host-core's encrypted secret store. */
function createFakeHost() {
  const values = new Map();
  const methods = [];
  return {
    values,
    methods,
    async call(method, params = {}) {
      methods.push(method);
      switch (method) {
        case "secrets.set":
          values.set(params.secretRef, params.value);
          return { ok: true, backend: "file_fallback" };
        case "secrets.getForRuntime":
          return { value: values.get(params.secretRef) ?? null };
        case "secrets.has":
          return { has: values.has(params.secretRef) };
        case "secrets.delete":
          values.delete(params.secretRef);
          return { ok: true };
        default:
          throw new Error(`unexpected host method: ${method}`);
      }
    },
  };
}

test("the secret refs are the names already on disk", () => {
  // Changing either string orphans every stored credential: the old file stays
  // behind and the new ref reads as unconfigured.
  assert.equal(VOICE_TENCENT_SECRET_ID_REF, "secret:voice:tencent:secret_id");
  assert.equal(VOICE_TENCENT_SECRET_KEY_REF, "secret:voice:tencent:secret_key");
  assert.notEqual(VOICE_TENCENT_SECRET_ID_REF, VOICE_TENCENT_SECRET_KEY_REF);
});

test("a written pair reads back, through the host and nowhere else", async () => {
  const host = createFakeHost();
  const store = createVoiceCredentialStore(() => host);

  await store.write({ secretId: "AKIDexample", secretKey: "secret-example" });

  assert.deepEqual(await store.read(), {
    secretId: "AKIDexample",
    secretKey: "secret-example",
  });
  assert.deepEqual(
    [...host.values.entries()],
    [
      [VOICE_TENCENT_SECRET_ID_REF, "AKIDexample"],
      [VOICE_TENCENT_SECRET_KEY_REF, "secret-example"],
    ],
  );
  assert.ok(
    host.methods.every((method) => method.startsWith("secrets.")),
    `unexpected host surface: ${host.methods.join(", ")}`,
  );
});

test("write resolves to nothing a caller could render", async () => {
  // The store is write-only from the renderer's side; returning the value would
  // hand it back to the page that typed it.
  const store = createVoiceCredentialStore(() => createFakeHost());
  assert.equal(await store.write({ secretId: "a", secretKey: "b" }), undefined);
});

test("half a credential reads as none", async () => {
  const host = createFakeHost();
  const store = createVoiceCredentialStore(() => host);

  // An interrupted first write leaves the id without its key. Signing needs
  // both, so reporting a pair here would promise a request that cannot work.
  host.values.set(VOICE_TENCENT_SECRET_ID_REF, "AKIDexample");

  assert.equal(await store.read(), null);
  assert.deepEqual(await store.status(), { hasSecretId: true, hasSecretKey: false });
});

test("status asks whether a value exists, not what it is", async () => {
  const host = createFakeHost();
  const store = createVoiceCredentialStore(() => host);

  await store.write({ secretId: "AKIDexample", secretKey: "secret-example" });
  assert.deepEqual(await store.status(), { hasSecretId: true, hasSecretKey: true });

  host.methods.length = 0;
  await store.status();
  assert.deepEqual(host.methods, ["secrets.has", "secrets.has"]);
});

test("clear removes both halves", async () => {
  const host = createFakeHost();
  const store = createVoiceCredentialStore(() => host);

  await store.write({ secretId: "AKIDexample", secretKey: "secret-example" });
  await store.clear();

  assert.equal(host.values.size, 0);
  assert.equal(await store.read(), null);
  assert.deepEqual(await store.status(), { hasSecretId: false, hasSecretKey: false });
});

test("an unavailable host fails loudly rather than reading as unconfigured", async () => {
  // Returning null here would tell the user their credentials are missing when
  // the truth is that the backend is down — and send them to re-enter a pair
  // that is already stored.
  const store = createVoiceCredentialStore(() => null);
  await assert.rejects(() => store.read(), /host unavailable/);
  await assert.rejects(() => store.status(), /host unavailable/);
  await assert.rejects(() => store.write({ secretId: "a", secretKey: "b" }), /host unavailable/);
});

test("the host is resolved per call, so a late boot still works", async () => {
  // Voice settings can be opened before host-core finishes starting.
  const host = createFakeHost();
  let resolved = null;
  const store = createVoiceCredentialStore(() => resolved);

  await assert.rejects(() => store.read(), /host unavailable/);
  resolved = host;
  await store.write({ secretId: "AKIDexample", secretKey: "secret-example" });
  assert.deepEqual(await store.status(), { hasSecretId: true, hasSecretKey: true });
});
