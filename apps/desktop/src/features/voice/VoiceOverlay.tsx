/**
 * The two voice states that need words: a transcript being produced, and a
 * session that was refused. Recording is not one of them — the mic button
 * carries that.
 */

import type { TFunction } from "i18next";
import type { VoiceState } from "./useVoiceInput";

/**
 * A coded failure is shown in the user's language; an uncoded one keeps the
 * recognizer's own message, because inventing a translation for a failure
 * nobody anticipated would say less than the original does.
 *
 * `defaultValue` is what makes that fall back, and it is also why no list of
 * known codes is needed here: a code the catalog has never heard of resolves
 * to the detail it came with.
 */
function errorText(t: TFunction, state: VoiceState): string {
  const detail = state.error ?? "";
  return state.errorCode
    ? t(`settings.voiceError.${state.errorCode}`, { detail, defaultValue: detail })
    : detail;
}

interface VoiceOverlayProps {
  t: TFunction;
  state: VoiceState;
  onCancel: () => void;
}

export function VoiceOverlay({ t, state, onCancel }: VoiceOverlayProps) {
  // The mic button carries every other phase, including the wait for a
  // transcript: a panel that appears above the composer covers the text the
  // user is dictating into, which is the one thing they are looking at. Only a
  // refusal has nowhere else to go.
  if (state.phase !== "error") {
    return null;
  }

  return (
    <div className="voice-overlay" role="status" aria-live="polite">
      <div className="voice-overlay-content">
        <div className="voice-overlay-left">
          <span className="voice-error">{errorText(t, state)}</span>
        </div>
        <div className="voice-overlay-right">
          <button type="button" className="voice-cancel-btn" onClick={onCancel}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
