/**
 * Hold the right Alt key to dictate; release to transcribe.
 *
 * Deliberately not a `KEYBOARD_SHORTCUTS` entry. That model cannot represent a
 * bare modifier — `keyFromEvent` returns null for one, and `isAllowedKeybinding`
 * requires more than one part — and `useAppShellRuntime`'s `MODIFIER_ONLY_KEYS`
 * guard drops bare-modifier keydown on purpose. Push-to-talk needs the release
 * edge as well as the press edge, so it listens on its own.
 */

import { useEffect, useRef } from "react";
import type { VoicePhase } from "./useVoiceInput";

interface UseVoicePushToTalkOptions {
  /** Whether voice input is enabled at all. */
  enabled: boolean;
  /** Current phase. Read through a ref so the listeners never go stale. */
  phase: VoicePhase;
  /** Starts or stops a capture — the same toggle the mic button calls. */
  onToggle: () => void;
  /** Abandons a capture that never reached "listening". */
  onCancel: () => void;
}

export function useVoicePushToTalk({
  enabled,
  phase,
  onToggle,
  onCancel,
}: UseVoicePushToTalkOptions): void {
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!enabled) return;

    // Whether the key is down, so auto-repeat keydowns and a stray keyup can
    // neither double-start nor double-stop a capture.
    let held = false;
    // Whether THIS key press owns the capture that may be running. Releasing a
    // key must never stop a recording someone else began — the mic button, or
    // the keyboard shortcut.
    let ownsCapture = false;

    const release = () => {
      if (!held) return;
      held = false;
      const owned = ownsCapture;
      ownsCapture = false;
      if (!owned) return;

      const current = phaseRef.current;
      if (current === "listening") {
        toggleRef.current();
        return;
      }
      // A tap ends before the start has crossed IPC and reached "listening".
      // Nothing has been recorded at that point, so the tap means "never mind"
      // rather than "stop" — which is also why discarding needs no bookkeeping.
      // An earlier stop-only version had to remember the release and wait for
      // the phase to catch up, or it left the microphone open with the key up.
      if (current === "preparing" || current === "ready" || current === "starting") {
        cancelRef.current();
      }
      // Anything else — error, done, idle — has no capture to abandon, and
      // cancelling would only cut an error message short.
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // `event.code`, not `event.key` — the latter reports plain "Alt" for both
      // Alt keys, so the right one could not be told from the left.
      if (event.code !== "AltRight" || event.repeat) return;
      // Alt focuses the window menu on Windows; take the press so the menu does
      // not open under the dictation. System chords (Alt+Tab, Alt+F4) are
      // handled below the page and are unaffected by this.
      event.preventDefault();
      if (held) return;
      held = true;
      if (phaseRef.current !== "idle") return;
      ownsCapture = true;
      toggleRef.current();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "AltRight") return;
      release();
    };

    // Alt+Tab takes focus away and the keyup lands in the other window, which
    // would otherwise leave the microphone recording forever.
    const onBlur = () => release();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);
}
