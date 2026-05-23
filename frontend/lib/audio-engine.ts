import type { DbSong } from "@/lib/types";
import { mobileMediaCache } from "@/lib/mobile-media-cache";

export type EngineTrack = {
  id: string;
  videoId: string;
  title: string;
  artist?: string;
  thumbnail?: string;
};

type EngineCallbacks = {
  onPlayStateChange?: (isPlaying: boolean) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onDuration?: (duration: number) => void;
  onEnded?: () => void;
  onError?: (error: MediaError | null) => void;
  onNext?: () => void;
  onPrev?: () => void;
  // Called when the engine auto-advances to the next track internally (within the
  // `ended` event handler), bypassing the React useEffect cycle so that
  // audio.play() remains inside the trusted media-event context on Android Chrome.
  onAutoAdvance?: (song: DbSong) => void;
};

const STREAM_URL_CACHE_TTL_MS = 60 * 60 * 1000;
const QUEUE_PRELOAD_BATCH_SIZE = 3; // Keep enough tracks ready for background transitions
const URL_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // Refresh URLs every 30 minutes
const TRANSITION_ANOMALY_WINDOW_MS = 1_500;
const MAX_TRANSITION_RESUME_ATTEMPTS = 2;
const TRANSITION_RESUME_DELAYS_MS = [150, 600];

class AudioEngine {
  private audio: HTMLAudioElement | null = null;
  private preparedAudio: HTMLAudioElement | null = null;
  private callbacks: EngineCallbacks = {};
  private currentTrack: EngineTrack | null = null;
  private nextTrack: EngineTrack | null = null;
  private nextStreamUrl: string | null = null;
  private preparedTrackVideoId: string | null = null;
  private streamUrlCache = new Map<string, { streamUrl: string; expiresAt: number }>();
  private preloadRequested = new Set<string>();
  private mediaSessionInitialized = false;
  private visibilityHandlerAttached = false;
  private gestureUnlocked = false;
  private upcomingTracks: EngineTrack[] = [];
  private upcomingStreamUrls = new Map<string, string>();
  private urlRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  // Monotonic counter — bumped on every playSong call so stale async continuations can self-abort
  private playGeneration = 0;
  // Throttle setPositionState calls in timeupdate (~every 1 s is enough for the notification)
  private positionUpdateTick = 0;
  // Full DbSong for the next track so direct transitions can notify React
  private nextSong: DbSong | null = null;
  // Set to a videoId when the engine directly transitions within the ended handler;
  // playSong() checks this and skips to avoid a duplicate play.
  private directTransitionVideoId: string | null = null;
  private transitionCount = 0;
  private currentPlaybackOrdinal = 0;
  private lastMediaSessionPlaybackState: MediaSessionPlaybackState | "unsupported" = "unsupported";
  private expectedToBePlaying = false;
  private userPauseRequested = false;
  private lastTransitionStartedAt: number | null = null;
  private transitionRecoveryAttempts = 0;
  private transitionRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

  init(): void {
    this.ensureAudio();
  }

  setCallbacks(callbacks: EngineCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setNextTrack(song: DbSong | null): void {
    if (!song?.youtube_video_id) {
      this.nextTrack = null;
      this.nextSong = null;
      this.nextStreamUrl = null;
      return;
    }

    this.nextSong = song;
    this.nextTrack = this.toEngineTrack(song);
    this.preResolveAndWarmNext().catch(() => {
      // Best effort only.
    });
  }

  /**
   * Preload upcoming tracks from the queue upfront.
   * This is the critical fix for mobile background playback.
   * Call this when a playlist loads to resolve URLs in batch.
   */
  async preloadQueueTracks(songs: DbSong[]): Promise<void> {
    try {
      if (!this.shouldUseDownloadFlow()) {
        this.upcomingTracks = [];
        this.upcomingStreamUrls.clear();
        return;
      }

      const tracksToPreload = songs
        .slice(0, QUEUE_PRELOAD_BATCH_SIZE)
        .filter((s) => s.youtube_video_id)
        .map((s) => this.toEngineTrack(s));

      this.upcomingTracks = tracksToPreload;

      const queueIds = tracksToPreload.map((track) => track.videoId);
      if (queueIds.length === 0) {
        return;
      }

      const prefetchPromises = queueIds.map((videoId) =>
        this.resolveStreamUrl(videoId, false, { preferLocal: true })
          .then((url) => {
            this.upcomingStreamUrls.set(videoId, url);
            return { videoId, url };
          })
          .catch(() => null)
      );

      await Promise.allSettled(prefetchPromises);

      // Start periodic refresh of upcoming URLs to keep them fresh
      this.startUrlRefreshTimer();
    } catch {
      // Best effort only
    }
  }

  /**
   * Get a pre-cached stream URL for an upcoming track.
   * Returns null if URL is not yet resolved.
   */
  getUpcomingStreamUrl(videoId: string): string | null {
    return this.upcomingStreamUrls.get(videoId) ?? null;
  }

  async playSong(song: DbSong): Promise<void> {
    if (!song.youtube_video_id) {
      throw new Error("Song has no YouTube video id");
    }

    // The engine already started playing this track via a direct transition inside
    // the ended event handler.  Skip the duplicate play so we don't restart it.
    if (song.youtube_video_id === this.directTransitionVideoId) {
      this.directTransitionVideoId = null;
      return;
    }
    // A different song was requested — clear any stale guard so it can never
    // accidentally match a future playSong call.
    this.directTransitionVideoId = null;

    // Bump generation so any in-flight call for a previous song aborts itself
    const generation = ++this.playGeneration;
    // Reset position tick so timeupdate throttle doesn't skip the first updates
    this.positionUpdateTick = 0;

    const track = this.toEngineTrack(song);
    const audio = this.ensureAudio();
    this.currentTrack = track;
    this.currentPlaybackOrdinal = this.transitionCount + 1;
    this.debugLog("playSong:start", {
      videoId: track.videoId,
      title: track.title,
      transitionCount: this.transitionCount,
      playbackOrdinal: this.currentPlaybackOrdinal,
      trackPhase: this.describeTrackPhase(this.currentPlaybackOrdinal),
    });

    // Use any pre-resolved URL (respects TTL); fall back to a fresh API fetch
    let streamUrl = this.getResolvedUrl(track.videoId);
    if (!streamUrl && this.shouldUseDownloadFlow()) {
      streamUrl = await mobileMediaCache.getCachedSrc(track.videoId);
    }
    if (!streamUrl) {
      streamUrl = await this.resolveStreamUrl(track.videoId);
    }

    // Abort if a newer playSong was called while we were awaiting the URL
    if (generation !== this.playGeneration) return;

    // Always reassign src — clears any prior error state on the element
    audio.src = streamUrl;
    this.debugLog("playSong:src-assigned", {
      videoId: track.videoId,
      srcKind: this.describeSrcKind(streamUrl),
      playbackOrdinal: this.currentPlaybackOrdinal,
      trackPhase: this.describeTrackPhase(this.currentPlaybackOrdinal),
    });

    this.updateMediaSession(track);

    try {
      await audio.play();
      this.debugLog("playSong:play-success", {
        videoId: track.videoId,
        playbackOrdinal: this.currentPlaybackOrdinal,
        trackPhase: this.describeTrackPhase(this.currentPlaybackOrdinal),
      });
    } catch (err) {
      if (generation !== this.playGeneration) return; // superseded — not our error
      this.debugLog("playSong:play-failed", {
        videoId: track.videoId,
        playbackOrdinal: this.currentPlaybackOrdinal,
        trackPhase: this.describeTrackPhase(this.currentPlaybackOrdinal),
        error: this.describeError(err),
      });
      throw err;
    }

    if (generation !== this.playGeneration) return;
    void this.preResolveAndWarmNext();
  }

  /**
   * Return the best cached stream URL for a videoId without making a network request.
   * Checks (in order): streamUrlCache (with TTL), nextStreamUrl, upcomingStreamUrls.
   */
  private getResolvedUrl(videoId: string): string | null {
    // Primary — stream URL cache with TTL validation
    const cached = this.streamUrlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.streamUrl;
    }

    // Secondary — next-track preload (recently resolved)
    if (this.nextTrack?.videoId === videoId && this.nextStreamUrl) {
      return this.nextStreamUrl;
    }

    // Tertiary — upcoming-streams map populated by preloadQueueTracks
    const upcoming = this.upcomingStreamUrls.get(videoId);
    if (upcoming) return upcoming;

    return null;
  }

  async syncPlaybackState(shouldPlay: boolean): Promise<void> {
    const audio = this.ensureAudio();

    if (shouldPlay && audio.paused) {
      this.expectedToBePlaying = true;
      this.userPauseRequested = false;
      await audio.play();
    }

    if (!shouldPlay && !audio.paused) {
      this.expectedToBePlaying = false;
      this.userPauseRequested = true;
      audio.pause();
    }
  }

  seekTo(time: number): void {
    const audio = this.ensureAudio();
    audio.currentTime = time;
  }

  async primeOnGesture(): Promise<void> {
    if (this.gestureUnlocked) return;

    const audio = this.ensureAudio();
    const previousSrc = audio.src;
    const previousVolume = audio.volume;
    const silent =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

    audio.src = silent;
    audio.volume = 0;

    try {
      await audio.play();
      audio.pause();
      this.gestureUnlocked = true;
    } finally {
      audio.src = previousSrc;
      audio.volume = previousVolume;
    }
  }

  private ensureAudio(): HTMLAudioElement {
    if (typeof window === "undefined") {
      throw new Error("Audio engine can only run in the browser");
    }

    if (this.audio) return this.audio;

    const element = this.createAudioElement();
    this.audio = element;
    this.attachEvents(element);
    this.initMediaSessionOnce();
    this.initVisibilityHandler();
    this.initHeartbeat();
    return element;
  }

  private ensurePreparedAudio(): HTMLAudioElement {
    if (typeof window === "undefined") {
      throw new Error("Audio engine can only run in the browser");
    }

    if (this.preparedAudio) return this.preparedAudio;

    const element = this.createAudioElement();
    this.preparedAudio = element;
    this.attachEvents(element);
    return element;
  }

  private createAudioElement(): HTMLAudioElement {
    const element = new Audio();
    element.preload = "auto";
    element.style.cssText =
      "position:fixed;width:0;height:0;opacity:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(element);
    return element;
  }

  private attachEvents(audio: HTMLAudioElement): void {
    const isActiveAudio = () => this.audio === audio;

    audio.addEventListener("play", () => {
      if (!isActiveAudio()) return;
      // NOTE: directTransitionVideoId is intentionally NOT cleared here.
      // The play event can fire before React's state-update cycle completes and
      // the playSong() guard runs. Clearing it here would let the React effect's
      // playSong() call restart the song mid-play (and re-run updateMediaSession,
      // killing the notification again). playSong() clears the guard itself.

      this.callbacks.onPlayStateChange?.(true);
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
        this.lastMediaSessionPlaybackState = navigator.mediaSession.playbackState;
        // Re-apply metadata on every play event — the only reliable hook on iOS
        // after the page was backgrounded or the MediaSession session was reset.
        if (this.currentTrack) {
          this.updateMediaSession(this.currentTrack);
        }
      }
      this.expectedToBePlaying = true;
      this.userPauseRequested = false;
      this.debugAudioState("event:play");
    });

    audio.addEventListener("pause", () => {
      if (!isActiveAudio()) return;

      const shouldRecover = this.shouldAttemptTransitionRecovery();
      if (shouldRecover) {
        this.debugAudioState("transition:unexpected-pause");
        this.scheduleTransitionRecovery("pause-event");
        return;
      }

      this.callbacks.onPlayStateChange?.(false);
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
        this.lastMediaSessionPlaybackState = navigator.mediaSession.playbackState;
      }
      this.expectedToBePlaying = false;
      this.debugAudioState("event:pause");
    });

    audio.addEventListener("loadedmetadata", () => {
      if (!isActiveAudio()) return;
      const duration = audio.duration;
      if (Number.isFinite(duration)) {
        this.callbacks.onDuration?.(duration);
        // Tell Android Chrome the real duration so the notification seek bar is accurate
        this.setPositionState(0, duration);
      }
      this.debugAudioState("event:loadedmetadata");
    });

    audio.addEventListener("timeupdate", () => {
      if (!isActiveAudio()) return;

      const currentTime = audio.currentTime;
      const duration = audio.duration;
      this.callbacks.onTimeUpdate?.(currentTime, duration);

      // Throttle to ~every 1 s — Android notification needs periodic position updates
      this.positionUpdateTick++;
      if (this.positionUpdateTick % 4 === 0 && Number.isFinite(duration) && duration > 0) {
        this.setPositionState(currentTime, duration);
      }

      if (
        Number.isFinite(duration) &&
        duration > 0 &&
        duration - currentTime <= 20 &&
        this.nextTrack &&
        !this.nextStreamUrl
      ) {
        this.preResolveAndWarmNext().catch(() => {
          // Best effort only.
        });
      }
    });

    audio.addEventListener("ended", () => {
      if (!isActiveAudio()) return;
      this.transitionCount += 1;
      this.debugAudioState("event:ended");
      // ── Direct transition (critical for mobile autoplay) ──────────────────
      // audio.play() for the next track MUST be called synchronously within
      // this trusted media-event handler. Going through React's async state
      // update cycle breaks the trusted context on Android Chrome, causing
      // audio.play() to be blocked by autoplay policy from the 3rd song onward
      // (and MediaSession notifications to disappear between tracks).
      if (this.nextSong && this.nextTrack && this.audio) {
        const nextUrl = this.getResolvedUrl(this.nextTrack.videoId);
        if (nextUrl) {
          const gen = ++this.playGeneration;
          this.positionUpdateTick = 0;
          const track = this.nextTrack;
          const song = this.nextSong;
          const previousAudio = this.audio;
          const canSwapPreparedAudio =
            this.preparedAudio != null &&
            this.preparedTrackVideoId === track.videoId &&
            this.preparedAudio.src.length > 0;

          this.currentTrack = track;
          this.currentPlaybackOrdinal = this.transitionCount + 1;
          this.lastTransitionStartedAt = Date.now();
          this.transitionRecoveryAttempts = 0;
          this.clearTransitionRecoveryTimer();
          this.expectedToBePlaying = true;
          this.userPauseRequested = false;
          // Mark so playSong() skips this videoId when React's useEffect fires
          this.directTransitionVideoId = track.videoId;

          // Snapshot then clear next-track state before the async continuation
          this.nextTrack = null;
          this.nextSong = null;
          this.nextStreamUrl = null;

          if (canSwapPreparedAudio && this.preparedAudio) {
            this.audio = this.preparedAudio;
            this.preparedAudio = previousAudio;
            this.preparedTrackVideoId = null;
            this.preparedAudio.pause();
            this.preparedAudio.removeAttribute("src");
            this.preparedAudio.load();
          } else {
            // Fallback when standby preparation failed: keep the legacy src swap path.
            this.audio.src = nextUrl;
          }

          this.debugLog("transition:src-assigned", {
            fromVideoId: song.youtube_video_id,
            toVideoId: track.videoId,
            srcKind: this.describeSrcKind(this.audio.src || nextUrl),
            transitionCount: this.transitionCount,
            playbackOrdinal: this.currentPlaybackOrdinal,
            trackPhase: this.describeTrackPhase(this.currentPlaybackOrdinal),
            usedPreparedAudio: canSwapPreparedAudio,
          });
          this.updateMediaSession(track);

          // play() called synchronously — still within the ended event handler
          const playPromise = this.audio.play();

          // Notify React to advance its UI state (currentSong, queue pos, etc.)
          this.callbacks.onAutoAdvance?.(song);

          // Pre-resolve the track after next in the background
          void this.preResolveAndWarmNext();

          if (playPromise) {
            playPromise
              .then(() => {
                this.expectedToBePlaying = true;
                this.debugLog("transition:play-success", {
                  videoId: track.videoId,
                  transitionCount: this.transitionCount,
                  playbackOrdinal: this.currentPlaybackOrdinal,
                  trackPhase: this.describeTrackPhase(this.currentPlaybackOrdinal),
                });
                this.scheduleTransitionRecovery("post-transition-watchdog");
              })
              .catch((error) => {
                this.expectedToBePlaying = false;
                this.debugLog("transition:play-failed", {
                  videoId: track.videoId,
                  transitionCount: this.transitionCount,
                  playbackOrdinal: this.currentPlaybackOrdinal,
                  trackPhase: this.describeTrackPhase(this.currentPlaybackOrdinal),
                  error: this.describeError(error),
                });
                if (gen !== this.playGeneration) return;
                // Direct play failed — clear the guard and let error handling run
                this.directTransitionVideoId = null;
                this.callbacks.onError?.(null);
              });
          }
          return;
        }
      }

      // Fallback: no cached URL yet — let React handle it via onEnded
      this.callbacks.onEnded?.();
    });

    audio.addEventListener("error", () => {
      if (!isActiveAudio()) return;
      this.debugAudioState("event:error");
      this.callbacks.onError?.(this.audio?.error ?? null);
    });

    for (const eventName of ["loadstart", "canplay", "canplaythrough", "playing", "waiting", "stalled", "suspend", "abort", "emptied"] as const) {
      audio.addEventListener(eventName, () => {
        if (!isActiveAudio()) return;
        this.debugAudioState(`event:${eventName}`);
      });
    }
  }

  private initMediaSessionOnce(): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (this.mediaSessionInitialized) return;

    const session = navigator.mediaSession;

    const safeSet = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler
    ) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Some actions are not supported on all devices.
      }
    };

    // Core playback controls
    safeSet("play", async () => {
      await this.syncPlaybackState(true);
    });

    safeSet("pause", () => {
      void this.syncPlaybackState(false);
    });

    // Queue navigation
    safeSet("nexttrack", async () => {
      this.callbacks.onNext?.();
    });

    safeSet("previoustrack", async () => {
      this.callbacks.onPrev?.();
    });

    // Seeking support
    safeSet("seekto", (details) => {
      if (details.seekTime == null) return;
      this.seekTo(details.seekTime);
    });

    // Seeking forward/backward (for devices with skip buttons)
    safeSet("seekforward", (details) => {
      if (!this.audio) return;
      const skipTime = details.seekOffset ?? 15;
      this.seekTo(Math.min(this.audio.currentTime + skipTime, this.audio.duration));
    });

    safeSet("seekbackward", (details) => {
      if (!this.audio) return;
      const skipTime = details.seekOffset ?? 15;
      this.seekTo(Math.max(this.audio.currentTime - skipTime, 0));
    });

    // Stop handler (important for Android cleanup)
    safeSet("stop", () => {
      void this.syncPlaybackState(false);
    });

    this.mediaSessionInitialized = true;
  }

  private updateMediaSession(track: EngineTrack): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const session = navigator.mediaSession;

    // Update metadata in-place — do NOT set playbackState="none" or metadata=null.
    // Android interprets playbackState="none" as the session ending, which:
    //   1. Drops the lock-screen notification immediately.
    //   2. Causes the next audio.play() to be treated as a new background autoplay
    //      request (throttled/blocked) rather than a continuation of an active session.
    // Updating metadata directly keeps the notification alive across track transitions.
    session.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist ?? "Pulsebox",
      artwork: track.thumbnail
        ? [{ src: track.thumbnail, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    session.playbackState = "playing";
    this.lastMediaSessionPlaybackState = session.playbackState;
    this.debugLog("media-session:update", {
      videoId: track.videoId,
      title: track.title,
      playbackOrdinal: this.currentPlaybackOrdinal,
      trackPhase: this.describeTrackPhase(this.currentPlaybackOrdinal),
    });

    // Re-register action handlers on every track — Android Chrome can silently
    // drop them after the page is backgrounded or the screen is locked.
    this.mediaSessionInitialized = false;
    this.initMediaSessionOnce();

    // Reset the seek bar to 0 for the new track.
    this.setPositionState(0, 0);
  }

  private setPositionState(position: number, duration: number): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: duration > 0 ? duration : 0,
        playbackRate: this.audio?.playbackRate ?? 1,
        position: Math.min(position, duration > 0 ? duration : 0),
      });
    } catch {
      // setPositionState is not universally supported; safe to ignore
    }
  }

  private isDebugEnabled(): boolean {
    if (typeof window === "undefined") return false;

    try {
      const search = new URLSearchParams(window.location.search);
      if (search.get("audioDebug") === "1") return true;
      if (window.localStorage.getItem("pulsebox-audio-debug") === "1") return true;
    } catch {
      return false;
    }

    return false;
  }

  private debugLog(event: string, extra: Record<string, unknown> = {}): void {
    if (!this.isDebugEnabled()) return;

    const payload = {
      event,
      now: new Date().toISOString(),
      hidden: typeof document !== "undefined" ? document.hidden : undefined,
      currentTrack: this.currentTrack?.videoId ?? null,
      nextTrack: this.nextTrack?.videoId ?? null,
      playbackOrdinal: this.currentPlaybackOrdinal,
      trackPhase: this.describeTrackPhase(this.currentPlaybackOrdinal),
      ...extra,
    };

    console.log("[pulsebox-audio]", payload);
  }

  private debugAudioState(event: string): void {
    if (!this.isDebugEnabled() || !this.audio) return;

    this.debugLog(event, {
      readyState: this.audio.readyState,
      networkState: this.audio.networkState,
      paused: this.audio.paused,
      ended: this.audio.ended,
      currentTime: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : null,
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : null,
      currentSrc: this.audio.currentSrc || this.audio.src || null,
      mediaErrorCode: this.audio.error?.code ?? null,
      mediaErrorMessage: this.audio.error?.message ?? null,
      mediaSessionPlaybackState: this.getMediaSessionPlaybackState(),
    });
  }

  private describeSrcKind(src: string): string {
    if (src.startsWith("blob:")) return "blob";
    if (src.startsWith("data:")) return "data";
    if (src.startsWith("http://") || src.startsWith("https://")) return "remote";
    return "other";
  }

  private describeError(error: unknown): Record<string, unknown> {
    if (error instanceof DOMException) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return {
      value: String(error),
    };
  }

  private describeTrackPhase(playbackOrdinal: number): string {
    if (playbackOrdinal === 2) return "track-2-start";
    if (playbackOrdinal === 3) return "track-3-start";
    if (playbackOrdinal > 3) return `track-${playbackOrdinal}-start`;
    return "track-1-start";
  }

  private getMediaSessionPlaybackState(): MediaSessionPlaybackState | "unsupported" {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return "unsupported";
    }

    return navigator.mediaSession.playbackState;
  }

  /**
   * Periodically assert playbackState="playing" while audio is active.
   * Chrome Android aggressively suspends media sessions it considers inactive;
   * this heartbeat keeps the lock-screen notification alive between tracks.
   */
  private initHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      if (!this.audio) return;

      const sessionState = navigator.mediaSession.playbackState;
      const shouldBePlaying = !this.audio.paused && !this.audio.ended;

      if (shouldBePlaying) {
        if (sessionState !== "playing") {
          this.debugLog("media-session:state-drift", {
            expected: "playing",
            actual: sessionState,
          });
        }
        navigator.mediaSession.playbackState = "playing";
        this.lastMediaSessionPlaybackState = navigator.mediaSession.playbackState;
        return;
      }

      if (
        this.currentTrack &&
        this.audio.paused &&
        this.expectedToBePlaying &&
        !this.audio.ended &&
        sessionState !== "paused"
      ) {
        this.debugAudioState("media-session:silent-pause-suspected");
        this.scheduleTransitionRecovery("heartbeat");
      }
    }, 5_000);
  }

  private initVisibilityHandler(): void {
    if (typeof document === "undefined") return;
    if (this.visibilityHandlerAttached) return;
    this.visibilityHandlerAttached = true;

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      if (!this.currentTrack) return;

      // Android Chrome can drop MediaSession action handlers when the page has
      // been suspended (e.g. screen locked for a long time).  Re-registering
      // them on every resume is idempotent and keeps the lock-screen controls
      // functional for every track, not just the first one.
      this.mediaSessionInitialized = false;
      this.initMediaSessionOnce();

      // Re-apply metadata so the lock-screen notification is always current.
      this.updateMediaSession(this.currentTrack);

      if (this.audio && !this.audio.paused) {
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
      }
    });
  }

  private async preResolveAndWarmNext(): Promise<void> {
    if (!this.nextTrack) return;

    if (!this.nextStreamUrl) {
      this.nextStreamUrl = await this.resolveStreamUrl(this.nextTrack.videoId, false, {
        preferLocal: this.shouldUseDownloadFlow(),
      });
    }

    if (this.preloadRequested.has(this.nextTrack.videoId)) return;
    this.preloadRequested.add(this.nextTrack.videoId);

    this.prepareStandbyAudio(this.nextTrack.videoId, this.nextStreamUrl);

    if (this.nextStreamUrl.startsWith("blob:")) {
      return;
    }

    try {
      await fetch(this.nextStreamUrl, {
        method: "GET",
        headers: { Range: "bytes=0-262143" },
      });
    } catch {
      // Keep moving; preloading is opportunistic.
    }
  }

  private prepareStandbyAudio(videoId: string, src: string): void {
    try {
      const audio = this.ensurePreparedAudio();
      if (this.preparedTrackVideoId === videoId && audio.src === src) {
        return;
      }

      audio.pause();
      audio.src = src;
      audio.load();
      this.preparedTrackVideoId = videoId;
      this.debugLog("prepared-audio:ready", {
        videoId,
        srcKind: this.describeSrcKind(src),
      });
    } catch {
      // Best effort only.
    }
  }

  private shouldAttemptTransitionRecovery(): boolean {
    if (!this.audio || !this.expectedToBePlaying) return false;
    if (this.userPauseRequested) return false;
    if (this.audio.ended) return false;
    if (this.audio.error) return false;
    if (this.audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
    if (this.lastTransitionStartedAt == null) return false;
    if (Date.now() - this.lastTransitionStartedAt > TRANSITION_ANOMALY_WINDOW_MS) return false;
    if (this.transitionRecoveryAttempts >= MAX_TRANSITION_RESUME_ATTEMPTS) return false;
    return true;
  }

  private scheduleTransitionRecovery(reason: string): void {
    if (!this.shouldAttemptTransitionRecovery()) return;
    if (this.transitionRecoveryTimer) return;

    const delay =
      TRANSITION_RESUME_DELAYS_MS[
        Math.min(this.transitionRecoveryAttempts, TRANSITION_RESUME_DELAYS_MS.length - 1)
      ] ?? 250;

    this.debugLog("transition:resume-attempt", {
      reason,
      attempt: this.transitionRecoveryAttempts + 1,
      delayMs: delay,
    });

    this.transitionRecoveryTimer = setTimeout(() => {
      this.transitionRecoveryTimer = null;
      void this.attemptTransitionRecovery(reason);
    }, delay);
  }

  private async attemptTransitionRecovery(reason: string): Promise<void> {
    if (!this.audio) return;
    if (!this.shouldAttemptTransitionRecovery()) return;

    this.transitionRecoveryAttempts += 1;

    try {
      await this.audio.play();
      this.expectedToBePlaying = true;
      this.userPauseRequested = false;
      this.debugLog("transition:resume-success", {
        reason,
        attempt: this.transitionRecoveryAttempts,
      });
    } catch (error) {
      this.debugLog("transition:resume-failed", {
        reason,
        attempt: this.transitionRecoveryAttempts,
        error: this.describeError(error),
      });
      this.scheduleTransitionRecovery("retry-after-failure");
      if (this.transitionRecoveryAttempts >= MAX_TRANSITION_RESUME_ATTEMPTS) {
        this.expectedToBePlaying = false;
        this.callbacks.onPlayStateChange?.(false);
      }
    }
  }

  private clearTransitionRecoveryTimer(): void {
    if (!this.transitionRecoveryTimer) return;
    clearTimeout(this.transitionRecoveryTimer);
    this.transitionRecoveryTimer = null;
  }

  private async resolveStreamUrl(
    videoId: string,
    forceRefresh = false,
    options: { preferLocal?: boolean } = {}
  ): Promise<string> {
    const cached = this.streamUrlCache.get(videoId);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return cached.streamUrl;
    }

    if (this.shouldUseDownloadFlow()) {
      const cachedLocal = await mobileMediaCache.getCachedSrc(videoId);
      if (cachedLocal) {
        this.streamUrlCache.set(videoId, {
          streamUrl: cachedLocal,
          expiresAt: Date.now() + STREAM_URL_CACHE_TTL_MS,
        });
        return cachedLocal;
      }
    }

    if (this.shouldUseDownloadFlow() && options.preferLocal) {
      try {
        const localUrl = await mobileMediaCache.prefetchTrack(videoId);
        this.streamUrlCache.set(videoId, {
          streamUrl: localUrl,
          expiresAt: Date.now() + STREAM_URL_CACHE_TTL_MS,
        });
        return localUrl;
      } catch {
        // Fall through to remote URL resolution.
      }
    }

    const flow = this.shouldUseDownloadFlow() ? "cache" : "direct";

    const primaryEndpoint = `/api/youtube/audio-mp3/${videoId}?flow=${flow}`;

    let response = await fetch(primaryEndpoint);
    if (!response.ok) {
      response = await fetch(`/api/youtube/audio-mp3/${videoId}?flow=${flow}`);
    }

    if (!response.ok) {
      throw new Error(`Stream URL resolve failed: ${response.status}`);
    }

    // The new endpoint returns { status, link }
    const data = (await response.json()) as { link?: string; status?: string };
    const streamUrl = data.link;

    if (!streamUrl) {
      throw new Error("Resolver response missing link");
    }

    this.streamUrlCache.set(videoId, {
      streamUrl,
      expiresAt: Date.now() + STREAM_URL_CACHE_TTL_MS,
    });
    return streamUrl;
  }

  private shouldUseDownloadFlow(): boolean {
    if (typeof window === "undefined") return false;

    const nav = navigator as Navigator & { standalone?: boolean };
    const isStandalonePwa =
      window.matchMedia?.("(display-mode: standalone)")?.matches || nav.standalone === true;
    const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? "");

    return isStandalonePwa || isMobileUa;
  }

  private async isPlayableStreamUrl(streamUrl: string): Promise<boolean> {
    try {
      const head = await fetch(streamUrl, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (head.ok) return true;
    } catch {
      // Some providers reject HEAD.
    }

    try {
      const range = await fetch(streamUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Range: "bytes=0-0",
        },
      });
      return range.ok || range.status === 206;
    } catch {
      return false;
    }
  }

  private toEngineTrack(song: DbSong): EngineTrack {
    if (!song.youtube_video_id) {
      throw new Error("Song missing youtube_video_id");
    }

    return {
      id: song.id,
      videoId: song.youtube_video_id,
      title: song.title,
      artist: song.artist ?? undefined,
      thumbnail: song.thumbnail ?? undefined,
    };
  }

  private startUrlRefreshTimer(): void {
    // Clear any existing timer
    if (this.urlRefreshTimer) {
      clearInterval(this.urlRefreshTimer);
    }

    // Periodically refresh upcoming track URLs to keep them fresh
    // Don't refresh during exact transition moments (handled separately)
    this.urlRefreshTimer = setInterval(() => {
      this.refreshUpcomingUrls().catch(() => {
        // Refresh failures are best-effort only
      });
    }, URL_REFRESH_INTERVAL_MS);
  }

  private async refreshUpcomingUrls(): Promise<void> {
    // Refresh URLs for upcoming tracks in the background
    // This keeps them valid even if the user is on the same track for a long time
    for (const track of this.upcomingTracks) {
      try {
        const url = await this.resolveStreamUrl(track.videoId, true); // Force refresh
        this.upcomingStreamUrls.set(track.videoId, url);
      } catch {
        // Continue with other tracks if one fails
      }
    }
  }
}

export const audioEngine = new AudioEngine();
