/**
 * Microphone button for the Composer toolbar.
 *
 * The button is the recording indicator: it turns red and pulses while a
 * capture is live, the way a hold-to-talk control does, rather than leaning on
 * the overlay above the composer. The overlay is left to the states that need
 * words — transcribing and error.
 *
 * Clicking always toggles. It used to call `onCancel` while active, so a click
 * meant to stop-and-transcribe silently threw the recording away.
 */

import type { TFunction } from "i18next";
import { IconMic } from "../../components/icons";
import { TooltipButton } from "../../components/ui";
import type { VoicePhase } from "./useVoiceInput";

interface VoiceMicButtonProps {
  t: TFunction;
  phase: VoicePhase;
  disabled: boolean;
  onToggle: () => void;
}

/** Phases in which a capture is open or on its way up. */
const RECORDING_PHASES: readonly VoicePhase[] = ["preparing", "starting", "listening"];

export function VoiceMicButton({ t, phase, disabled, onToggle }: VoiceMicButtonProps) {
  const isRecording = RECORDING_PHASES.includes(phase);
  const isTranscribing = phase === "transcribing";

  // The idle label used to be derived by stripping the ellipsis off
  // `settings.voiceRecording`, which reads "Listening…" — so the button
  // claimed to be listening whenever it was not.
  const label = isRecording
    ? t("chat.stopDictation")
    : isTranscribing
      ? t("settings.voiceTranscribing")
      : t("chat.dictate");

  return (
    <TooltipButton
      type="button"
      className={`icon-btn icon-btn-square${isRecording ? " voice-active" : ""}`}
      tooltip={label}
      ariaLabel={label}
      aria-pressed={isRecording || isTranscribing}
      aria-busy={isTranscribing ? "true" : undefined}
      // A live capture stays clickable even if the composer blocks its
      // controls mid-session: without that there would be no way to stop.
      disabled={disabled && !isRecording && !isTranscribing}
      onClick={onToggle}
    >
      {/* The wait for a transcript is shown here rather than in a panel above
          the composer — that panel covered the line being dictated into. */}
      {isTranscribing ? (
        <span className="voice-spinner" aria-hidden="true" />
      ) : (
        <IconMic
          size={15}
          aria-hidden="true"
          className={isRecording ? "voice-mic-active" : undefined}
        />
      )}
    </TooltipButton>
  );
}
