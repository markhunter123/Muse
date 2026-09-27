/**
 * Where the Tencent Cloud credential pair lives, and the only two ways it moves.
 *
 * host-core stores a secret opaquely under `sha256(secretRef)` and never learns
 * what a ref means, so the names below are this app's contract with itself —
 * changing one silently orphans whatever the user already stored.
 *
 * Writes go through `secrets.set` and reads through `secrets.getForRuntime`.
 * The latter is a main-process-only method: the renderer has a channel to set a
 * credential and no channel to read one back, so the value the user types is
 * never returned to the page that typed it.
 */

import type { TencentAsrCredentials } from "@muse/voice-runtime";

/** The host RPC surface this module needs; satisfied by `HostProcess`. */
export type VoiceHost = {
  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
};

export const VOICE_TENCENT_SECRET_ID_REF = "secret:voice:tencent:secret_id";
export const VOICE_TENCENT_SECRET_KEY_REF = "secret:voice:tencent:secret_key";

export interface VoiceCredentialStatus {
  hasSecretId: boolean;
  hasSecretKey: boolean;
}

export interface VoiceCredentialStore {
  /** The stored pair, or null when either half is missing. */
  read(): Promise<TencentAsrCredentials | null>;
  write(credentials: TencentAsrCredentials): Promise<void>;
  clear(): Promise<void>;
  status(): Promise<VoiceCredentialStatus>;
}

export function createVoiceCredentialStore(getHost: () => VoiceHost | null): VoiceCredentialStore {
  function host(): VoiceHost {
    const resolved = getHost();
    if (!resolved) throw new Error("host unavailable");
    return resolved;
  }

  async function readOne(secretRef: string): Promise<string | null> {
    const { value } = await host().call<{ value: string | null }>("secrets.getForRuntime", {
      secretRef,
    });
    return value ?? null;
  }

  async function hasOne(secretRef: string): Promise<boolean> {
    const { has } = await host().call<{ has: boolean }>("secrets.has", { secretRef });
    return Boolean(has);
  }

  return {
    async read() {
      const [secretId, secretKey] = await Promise.all([
        readOne(VOICE_TENCENT_SECRET_ID_REF),
        readOne(VOICE_TENCENT_SECRET_KEY_REF),
      ]);
      // Half a credential cannot sign anything, so it reads as none rather
      // than as a pair whose second request is guaranteed to fail.
      if (!secretId || !secretKey) return null;
      return { secretId, secretKey };
    },

    async write(credentials) {
      // SecretId first: a partial write then leaves the account one field short
      // of working, never holding a key that does not belong to an id.
      await host().call("secrets.set", {
        secretRef: VOICE_TENCENT_SECRET_ID_REF,
        value: credentials.secretId,
      });
      await host().call("secrets.set", {
        secretRef: VOICE_TENCENT_SECRET_KEY_REF,
        value: credentials.secretKey,
      });
    },

    async clear() {
      await host().call("secrets.delete", { secretRef: VOICE_TENCENT_SECRET_ID_REF });
      await host().call("secrets.delete", { secretRef: VOICE_TENCENT_SECRET_KEY_REF });
    },

    async status() {
      const [hasSecretId, hasSecretKey] = await Promise.all([
        hasOne(VOICE_TENCENT_SECRET_ID_REF),
        hasOne(VOICE_TENCENT_SECRET_KEY_REF),
      ]);
      return { hasSecretId, hasSecretKey };
    },
  };
}
