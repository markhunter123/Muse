/**
 * Renderer-side IPC wrapper for voice operations.
 * Uses window.museDesktop bridge exposed by the preload script.
 */

import { IPC, type Result } from "@muse/shared";

/**
 * Unwrap `Result<T>` into a value or a throwing error.
 *
 * A failure nests its message under `error`, so reading a flat `.message` — as
 * this helper used to — found nothing and reported every refusal as the
 * useless "IPC call failed". The message matters here more than elsewhere: a
 * refused capture is how the user learns their credentials are missing, and
 * that has to survive the trip.
 */
async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const bridge = window.museDesktop;
  if (!bridge) throw new Error("museDesktop bridge unavailable");
  const result = (await bridge.invoke(channel, ...args)) as Result<T>;
  if (!result.ok) {
    const error = new Error(result.error.message) as Error & {
      code?: string;
      details?: unknown;
    };
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }
  return result.data;
}

export const voiceIpc = {
  start: (settings?: Record<string, unknown>) =>
    invoke(IPC.invoke.voiceStart, settings),

  stop: () => invoke(IPC.invoke.voiceStop),

  cancel: () => invoke(IPC.invoke.voiceCancel),

  getState: () => invoke(IPC.invoke.voiceGetState),

  getDevices: () => invoke<unknown[]>(IPC.invoke.voiceGetDevices),

  getModels: () => invoke<unknown[]>(IPC.invoke.voiceGetModels),

  downloadModel: (modelId: string) =>
    invoke(IPC.invoke.voiceDownloadModel, { modelId }),

  deleteModel: (modelId: string) =>
    invoke(IPC.invoke.voiceDeleteModel, { modelId }),

  updateSettings: (settings: Record<string, unknown>) =>
    invoke(IPC.invoke.voiceUpdateSettings, settings),

  checkPermission: () =>
    invoke<string>(IPC.invoke.voiceCheckPermission),

  requestPermission: () =>
    invoke<boolean>(IPC.invoke.voiceRequestPermission),

  /** Stores a cloud credential pair. Nothing is returned but success. */
  setCredentials: (credentials: { secretId: string; secretKey: string }) =>
    invoke(IPC.invoke.voiceSetCredentials, credentials),

  clearCredentials: () => invoke(IPC.invoke.voiceClearCredentials),

  credentialStatus: () =>
    invoke<{ hasSecretId: boolean; hasSecretKey: boolean }>(
      IPC.invoke.voiceCredentialStatus,
    ),

  onStateChanged: (callback: (state: unknown) => void) => {
    const bridge = window.museDesktop;
    if (!bridge) return () => {};
    return bridge.on(IPC.event.voiceStateChanged, callback);
  },

  onModelProgress: (callback: (data: { modelId: string; progress: number }) => void) => {
    const bridge = window.museDesktop;
    if (!bridge) return () => {};
    return bridge.on(IPC.event.voiceModelProgress, callback as (...args: unknown[]) => void);
  },
};
