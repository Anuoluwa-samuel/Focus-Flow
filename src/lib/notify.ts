/**
 * Completion sound and browser notifications. Browser-only, and neither is needed for the timer to be correct.
 * - Audio is created only after a user gesture (primeAudio), so nothing ever plays unprompted.
 * - Notifications are shown only when the user has enabled them AND the browser already granted permission.
 */

let ctx: AudioContext | null = null;

/** Call from a click/key handler (e.g. Start). Creates or resumes the audio context under the user's gesture. */
export function primeAudio(): void {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* audio unavailable: ignore */
  }
}

/** Two soft sine tones. Returns false (silently) if audio was never primed or is blocked. */
export function playChime(): boolean {
  try {
    if (!ctx || ctx.state !== "running") return false;
    const t0 = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
    return true;
  } catch {
    return false;
  }
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export function showNotification(title: string, body: string): boolean {
  try {
    if (notificationPermission() !== "granted") return false;
    new Notification(title, { body, tag: "focusflow-session" });
    return true;
  } catch {
    return false; // some mobile browsers only allow notifications via a service worker
  }
}

const MUTE_KEY = "focusflow:muted";
export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
export function writeMuted(v: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* storage blocked: mute lasts for this visit only */
  }
}
