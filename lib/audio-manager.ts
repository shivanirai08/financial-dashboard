/**
 * lib/audio-manager.ts
 *
 * THE SINGLE AUDIO ELEMENT FOR THE ENTIRE APP LIFETIME.
 *
 * ─── WHY EACH BUG HAPPENS AND HOW THIS FIXES IT ────────────────────────────
 *
 * BUG 1 — Song stops when install prompt appears / tab closes:
 *   Cause A: `beforeinstallprompt` fires and Chrome shows its native mini-infobar.
 *            This interrupts audio. Fix: capture + preventDefault() the event at
 *            module load time (earliest possible moment).
 *   Cause B: `audio.load()` was called after setting audio.src in the old code.
 *            `audio.load()` resets the element's internal user-gesture unlock,
 *            causing Chrome to treat the next play() as unauthorized autoplay.
 *            Fix: never call audio.load() — assigning src is enough.
 *
 * BUG 2 — Second song stops after a few seconds / no lock screen for song 2:
 *   Cause A: audio.load() per-song reset the gesture token (same as above).
 *   Cause B: MediaSession metadata was set in a React useEffect (delayed, has gap
 *            where lock screen shows nothing and Chrome may drop the notification).
 *   Cause C: Action handlers were re-registered inside useEffect with stale deps,
 *            creating momentary gaps where handlers are null → Chrome drops notification.
 *   Fix: src-swap only, set metadata synchronously before fetch, register
 *        action handlers ONCE at module init, never re-register them.
 *
 * BUG 3 — Screen off / home button stops playback:
 *   Cause: Chrome keeps background audio alive ONLY when MediaSession action
 *          handlers are registered AND the audio element is appended to document.body.
 *          Without DOM attachment, Chrome throttles/kills the tab audio.
 *   Fix: append audio to document.body at creation, register all handlers at init.
 *
 * ─── INVARIANTS ─────────────────────────────────────────────────────────────
 *  1. One Audio element, created once, lives on document.body forever.
 *  2. Song change = audio.src swap ONLY. Never audio.load(), never new Audio().
 *  3. MediaSession handlers registered ONCE at init, never set to null.
 *  4. beforeinstallprompt captured at module import time.
 *  5. primeAudioOnGesture() called on every user tap (idempotent after first call).
 */

// ─── Install prompt capture — runs at import time ─────────────────────────────
// This is the FIRST thing that happens when the module loads.
// By capturing here (before any React component mounts), we guarantee that
// Chrome's mini-infobar never auto-fires mid-playback.
if (typeof window !== "undefined") {
  window.addEventListener(
    "beforeinstallprompt",
    (e) => {
      e.preventDefault(); // stops Chrome auto-showing the native install bar
      (window as any).__pulsebox_install_prompt = e;
    },
    // not { once: true } — keep re-capturing in case it re-fires after navigation
  );
}

// ─── Singleton audio element ──────────────────────────────────────────────────

let _audio: HTMLAudioElement | null = null;

/**
 * Returns the one persistent Audio element for the whole app.
 * Creates it on first call and appends it to document.body.
 *
 * WHY document.body.appendChild:
 *   Chrome Android requires the audio element to be in the DOM (not just in
 *   memory) to keep background audio alive when the screen turns off or the
 *   user switches apps. An audio element that lives only in a JS variable can
 *   be garbage-collected or suspended by the browser.
 */
export function getPersistentAudio(): HTMLAudioElement {
  if (typeof window === "undefined") return null as any;
  if (_audio) return _audio;

  _audio = new Audio();
  _audio.preload = "none";
  // Invisible but in DOM — this is the key Chrome needs for background playback
  _audio.style.cssText =
    "position:fixed;width:0;height:0;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(_audio);

  // Wire up MediaSession immediately, before any song plays
  _initMediaSessionHandlersOnce();

  return _audio;
}

// ─── User gesture unlock ──────────────────────────────────────────────────────

let _gestureUnlocked = false;

/**
 * Call this inside EVERY user-gesture handler (play button tap, skip tap, etc).
 *
 * WHY: Chrome Android requires a user gesture to unlock audio playback.
 * The first call plays 50ms of silent audio, which permanently unlocks the
 * element. Subsequent src changes (song swaps) inherit that unlock.
 * Without this, song 2+ will be blocked by autoplay policy.
 *
 * Safe to call on every click — it's a no-op after the first unlock.
 */
export function primeAudioOnGesture(): void {
  if (_gestureUnlocked) return;
  const audio = getPersistentAudio();
  // Shortest valid WAV — 50ms silence
  const silent =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  audio.src = silent;
  audio.volume = 0;
  const p = audio.play();
  if (p) {
    p.then(() => {
      audio.pause();
      audio.src = "";
      audio.volume = 1;
      _gestureUnlocked = true;
    }).catch(() => {
      // Gesture unlock failed — that's fine, the next actual play() will try again
      audio.volume = 1;
    });
  }
}

// ─── Queue navigation callbacks ───────────────────────────────────────────────
//
// WHY module-level refs instead of re-registering handlers in useEffect:
// MediaSession handlers must NEVER be null, even briefly. Re-registering them
// inside a React useEffect creates a moment where they are null (between the
// effect cleanup and re-run), which causes Chrome to drop the lock screen
// notification and not restore it for the next song.
//
// The solution: register handlers ONCE pointing to stable module-level refs,
// then update those refs when the component's callbacks change.

let _onNext: (() => void) | null = null;
let _onPrev: (() => void) | null = null;
let _onEnded: (() => void) | null = null;

/**
 * Update the callbacks for queue navigation.
 * Call from the player component on mount and whenever queue/index changes.
 * This updates the refs without touching MediaSession handlers.
 */
export function setAudioCallbacks(callbacks: {
  onNext?: () => void;
  onPrev?: () => void;
  onEnded?: () => void;
}) {
  if (callbacks.onNext !== undefined) _onNext = callbacks.onNext;
  if (callbacks.onPrev !== undefined) _onPrev = callbacks.onPrev;
  if (callbacks.onEnded !== undefined) _onEnded = callbacks.onEnded;
}

// ─── MediaSession — registered ONCE, never torn down ─────────────────────────

let _mediaSessionInitialized = false;

function _initMediaSessionHandlersOnce(): void {
  if (!("mediaSession" in navigator)) return;
  if (_mediaSessionInitialized) return;
  _mediaSessionInitialized = true;

  const ms = navigator.mediaSession;

  // Helper that swallows unsupported-action errors on older Android
  const safe = (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler
  ) => {
    try {
      ms.setActionHandler(action, handler);
    } catch {
      /* action not supported on this Android version — safe to ignore */
    }
  };

  safe("play", () => {
    _audio?.play().catch(() => {});
    ms.playbackState = "playing";
  });

  safe("pause", () => {
    _audio?.pause();
    ms.playbackState = "paused";
  });

  safe("stop", () => {
    _audio?.pause();
    if (_audio) _audio.currentTime = 0;
    ms.playbackState = "none";
  });

  // These call the module-level refs — always up to date, no stale closure
  safe("nexttrack", () => _onNext?.());
  safe("previoustrack", () => _onPrev?.());

  safe("seekto", (details) => {
    if (_audio && details.seekTime != null) {
      _audio.currentTime = details.seekTime;
    }
  });

  safe("seekbackward", (details) => {
    if (_audio) {
      _audio.currentTime = Math.max(
        0,
        _audio.currentTime - (details.seekOffset ?? 10)
      );
    }
  });

  safe("seekforward", (details) => {
    if (_audio) {
      _audio.currentTime = Math.min(
        _audio.duration || Infinity,
        _audio.currentTime + (details.seekOffset ?? 10)
      );
    }
  });
}

// ─── Metadata update ──────────────────────────────────────────────────────────

/**
 * Update the lock screen / notification metadata.
 *
 * CALL THIS SYNCHRONOUSLY when a new song is selected — before any fetch,
 * before audio.src is set. This way the lock screen updates instantly
 * instead of after the URL loads (which can take 1-2 seconds).
 *
 * WHY this fixes the "second song not on lock screen" bug:
 * The old code set metadata in a React useEffect that ran after render.
 * During the gap between song change and useEffect execution, Chrome saw no
 * active MediaSession and dropped the notification. Setting it here, before
 * the fetch even starts, keeps the notification alive continuously.
 */
export function updateMediaSessionMetadata(song: {
  title: string;
  artist?: string;
  thumbnail?: string;
}): void {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist ?? "Pulsebox",
    album: "Pulsebox",
    artwork: song.thumbnail
      ? [
          { src: song.thumbnail, sizes: "96x96",  type: "image/jpeg" },
          { src: song.thumbnail, sizes: "256x256", type: "image/jpeg" },
          { src: song.thumbnail, sizes: "512x512", type: "image/jpeg" },
        ]
      : [],
  });

  // Explicitly set to "playing" so Android renders the notification immediately.
  // Don't wait for the audio "play" event — by that time the notification gap has
  // already occurred.
  navigator.mediaSession.playbackState = "playing";
}

// ─── Install prompt ───────────────────────────────────────────────────────────

/**
 * Show the install prompt at a safe moment (e.g. when audio is paused).
 * Returns 'accepted' | 'dismissed' | 'unavailable'.
 */
export async function triggerInstallPrompt(): Promise<string> {
  const prompt = (window as any).__pulsebox_install_prompt as any;
  if (!prompt) return "unavailable";
  try {
    const result = await prompt.prompt();
    (window as any).__pulsebox_install_prompt = null;
    return result?.outcome ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

export function canInstall(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as any).__pulsebox_install_prompt
  );
}
