/**
 * Haptic feedback utilities.
 *
 * Uses the Vibration API (navigator.vibrate) when available.
 * All functions are safe to call on any platform – they silently
 * no-op when vibration is unsupported or disabled by the user.
 */

let enabled = true;

function canVibrate(): boolean {
  return enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/** Light tap – 10 ms vibration for cell taps. */
export function hapticLight(): void {
  if (canVibrate()) {
    navigator.vibrate(10);
  }
}

/** Medium tap – 20 ms vibration for number placement. */
export function hapticMedium(): void {
  if (canVibrate()) {
    navigator.vibrate(20);
  }
}

/** Success pattern – [10, 50, 20] for correct placement. */
export function hapticSuccess(): void {
  if (canVibrate()) {
    navigator.vibrate([10, 50, 20]);
  }
}

/** Error pattern – [30, 50, 30] for wrong placement. */
export function hapticError(): void {
  if (canVibrate()) {
    navigator.vibrate([30, 50, 30]);
  }
}

/** Heavy pattern – [10, 30, 10, 30, 50] for achievements / game complete. */
export function hapticHeavy(): void {
  if (canVibrate()) {
    navigator.vibrate([10, 30, 10, 30, 50]);
  }
}

/** Enable or disable haptic feedback globally. */
export function setHapticEnabled(on: boolean): void {
  enabled = on;
}

/** Current on/off state, for other modules (juice kit) that gate their own navigator.vibrate calls on it. */
export function isHapticEnabled(): boolean {
  return enabled;
}
