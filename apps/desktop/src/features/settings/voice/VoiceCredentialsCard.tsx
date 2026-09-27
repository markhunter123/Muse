/**
 * Tencent Cloud credential entry for the voice settings panel.
 *
 * The form is write-only by construction: `voiceIpc.setCredentials` stores the
 * pair and returns nothing, and the status call answers only whether a value is
 * present. A saved secret is therefore never rendered back.
 *
 * That is why a stored pair is shown as a masked row rather than as fields
 * holding dots: rendering an empty input next to a "saved" badge reads as
 * though the value was cleared. The mask is a fixed string, not a function of
 * the real length — it says "something is stored here", which is the whole of
 * what this side of the boundary can know.
 */

import { useCallback, useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { Badge, Button, Input } from "../../../components/ui";
import { SettingsCard, SettingsRow } from "../primitives";
import { voiceIpc } from "../../voice/voice-ipc";

interface CredentialStatus {
  hasSecretId: boolean;
  hasSecretKey: boolean;
}

const EMPTY_STATUS: CredentialStatus = { hasSecretId: false, hasSecretKey: false };

/** Fixed width, deliberately not derived from the stored value's length. */
const MASK = "••••••••••••";

export function VoiceCredentialsCard({ t, enabled }: { t: TFunction; enabled: boolean }) {
  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [status, setStatus] = useState<CredentialStatus>(EMPTY_STATUS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await voiceIpc.credentialStatus();
      setStatus({
        hasSecretId: Boolean(next?.hasSecretId),
        hasSecretKey: Boolean(next?.hasSecretKey),
      });
    } catch {
      // The host may still be booting; the badge keeps its last known state
      // rather than flickering to "not configured".
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const configured = status.hasSecretId && status.hasSecretKey;
  const editing = !configured || replacing;
  const canSave = secretId.trim().length > 0 && secretKey.trim().length > 0 && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await voiceIpc.setCredentials({ secretId: secretId.trim(), secretKey: secretKey.trim() });
      // Clear the draft rather than holding it: the value now lives in the
      // encrypted store, and a second copy in renderer state is the thing this
      // design exists to avoid. A blank field then means "nothing typed", which
      // the masked row makes unambiguous.
      setSecretId("");
      setSecretKey("");
      setReplacing(false);
      await refreshStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await voiceIpc.clearCredentials();
      setReplacing(false);
      await refreshStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard title={t("settings.voiceCredentials")}>
      {editing ? (
        <>
          <SettingsRow title={t("settings.voiceSecretId")}>
            <Input
              value={secretId}
              type="password"
              autoComplete="off"
              disabled={!enabled || busy}
              placeholder="AKID…"
              className="font-mono"
              aria-label={t("settings.voiceSecretId")}
              onChange={(event) => setSecretId(event.target.value)}
            />
          </SettingsRow>

          <SettingsRow title={t("settings.voiceSecretKey")}>
            <Input
              value={secretKey}
              type="password"
              autoComplete="off"
              disabled={!enabled || busy}
              className="font-mono"
              aria-label={t("settings.voiceSecretKey")}
              onChange={(event) => setSecretKey(event.target.value)}
            />
          </SettingsRow>
        </>
      ) : (
        <>
          {/* Decorative: the stored/not-stored state is carried by the badge,
              which is what a screen reader should read out. */}
          <SettingsRow title={t("settings.voiceSecretId")}>
            <span className="voice-secret-mask" aria-hidden="true">
              {MASK}
            </span>
          </SettingsRow>

          <SettingsRow title={t("settings.voiceSecretKey")}>
            <span className="voice-secret-mask" aria-hidden="true">
              {MASK}
            </span>
          </SettingsRow>
        </>
      )}

      <div className="voice-credentials-actions">
        {editing ? (
          <Button size="sm" variant="secondary" disabled={!enabled || !canSave} onClick={save}>
            {busy ? t("common.saving") : t("common.save")}
          </Button>
        ) : null}
        {configured ? <Badge tone="success">{t("settings.voiceCredentialsSaved")}</Badge> : null}
        {configured && !replacing ? (
          <Button size="sm" variant="ghost" disabled={!enabled || busy} onClick={() => setReplacing(true)}>
            {t("settings.voiceCredentialsChange")}
          </Button>
        ) : null}
        {configured ? (
          <Button size="sm" variant="ghost" disabled={!enabled || busy} onClick={remove}>
            {t("settings.voiceCredentialsRemove")}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="voice-credentials-error" role="alert">
          {error}
        </p>
      ) : null}
    </SettingsCard>
  );
}
