import type { DbSong } from "@/lib/types";

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
};

const STREAM_BACKEND_BASE =
  process.env.NEXT_PUBLIC_STREAM_BACKEND_URL?.replace(/\/$/, "") ?? "";
const STREAM_URL_CACHE_TTL_MS = 60 * 60 * 1000;

class AudioEngine {
  private audio: HTMLAudioElement | null = null;
  private callbacks: EngineCallbacks = {};
  private currentTrack: EngineTrack | null = null;
  private nextTrack: EngineTrack | null = null;
  private nextStreamUrl: string | null = null;
  private streamUrlCache = new Map<string, { streamUrl: string; expiresAt: number }>();
  private preloadRequested = new Set<string>();
  private mediaSessionInitialized = false;
  private gestureUnlocked = false;

  init(): void {
    this.ensureAudio();
  }

  setCallbacks(callbacks: EngineCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setNextTrack(song: DbSong | null): void {
    if (!song?.youtube_video_id) {
      this.nextTrack = null;
      this.nextStreamUrl = null;
      return;
    }

    this.nextTrack = this.toEngineTrack(song);
    this.preResolveAndWarmNext().catch(() => {
      // Best effort only.
    });
  }

  async playSong(song: DbSong): Promise<void> {
    if (!song.youtube_video_id) {
      throw new Error("Song has no YouTube video id");
    }

    const track = this.toEngineTrack(song);
    const audio = this.ensureAudio();
    this.currentTrack = track;

    let streamUrl: string;
    if (this.nextTrack?.videoId === track.videoId && this.nextStreamUrl) {
      streamUrl = this.nextStreamUrl;
    } else {
      streamUrl = await this.resolveStreamUrl(track.videoId);
    }

    const reachable = await this.isPlayableStreamUrl(streamUrl);
    if (!reachable) {
      streamUrl = await this.resolveStreamUrl(track.videoId, true);
    }

    if (audio.src !== streamUrl) {
      audio.src = streamUrl;
    }

    this.updateMediaSession(track);
    await audio.play();
    await this.preResolveAndWarmNext();
  }

  async syncPlaybackState(shouldPlay: boolean): Promise<void> {
    const audio = this.ensureAudio();

    if (shouldPlay && audio.paused) {
      await audio.play();
    }

    if (!shouldPlay && !audio.paused) {
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

    const element = new Audio();
    element.preload = "auto";
    element.style.cssText =
      "position:fixed;width:0;height:0;opacity:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(element);

    this.audio = element;
    this.attachEvents();
    this.initMediaSessionOnce();
    return element;
  }

  private attachEvents(): void {
    if (!this.audio) return;

    this.audio.addEventListener("play", () => {
      this.callbacks.onPlayStateChange?.(true);
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
    });

    this.audio.addEventListener("pause", () => {
      this.callbacks.onPlayStateChange?.(false);
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
    });

    this.audio.addEventListener("loadedmetadata", () => {
      if (!this.audio) return;
      const duration = this.audio.duration;
      if (Number.isFinite(duration)) {
        this.callbacks.onDuration?.(duration);
      }
    });

    this.audio.addEventListener("timeupdate", () => {
      if (!this.audio) return;

      const currentTime = this.audio.currentTime;
      const duration = this.audio.duration;
      this.callbacks.onTimeUpdate?.(currentTime, duration);

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

    this.audio.addEventListener("ended", () => {
      this.callbacks.onEnded?.();
    });

    this.audio.addEventListener("error", () => {
      this.callbacks.onError?.(this.audio?.error ?? null);
    });
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

    safeSet("play", async () => {
      await this.syncPlaybackState(true);
    });

    safeSet("pause", () => {
      void this.syncPlaybackState(false);
    });

    safeSet("nexttrack", async () => {
      this.callbacks.onNext?.();
    });

    safeSet("previoustrack", async () => {
      this.callbacks.onPrev?.();
    });

    safeSet("seekto", (details) => {
      if (details.seekTime == null) return;
      this.seekTo(details.seekTime);
    });

    this.mediaSessionInitialized = true;
  }

  private updateMediaSession(track: EngineTrack): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.playbackState = "playing";
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist ?? "Pulsebox",
      artwork: track.thumbnail
        ? [
            {
              src: track.thumbnail,
              sizes: "512x512",
              type: "image/jpeg",
            },
          ]
        : [],
    });
  }

  private async preResolveAndWarmNext(): Promise<void> {
    if (!this.nextTrack) return;

    if (!this.nextStreamUrl) {
      this.nextStreamUrl = await this.resolveStreamUrl(this.nextTrack.videoId);
    }

    if (this.preloadRequested.has(this.nextTrack.videoId)) return;
    this.preloadRequested.add(this.nextTrack.videoId);

    try {
      await fetch(this.nextStreamUrl, {
        method: "GET",
        headers: { Range: "bytes=0-262143" },
      });
    } catch {
      // Keep moving; preloading is opportunistic.
    }
  }

  private async resolveStreamUrl(videoId: string, forceRefresh = false): Promise<string> {
    const cached = this.streamUrlCache.get(videoId);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return cached.streamUrl;
    }

    const primaryEndpoint = STREAM_BACKEND_BASE
      ? `${STREAM_BACKEND_BASE}/api/youtube/audio/${videoId}`
      : `/api/youtube/audio/${videoId}`;
    const localEndpoint = `/api/youtube/audio/${videoId}`;

    let response = await fetch(primaryEndpoint);
    if (!response.ok && primaryEndpoint !== localEndpoint) {
      response = await fetch(localEndpoint);
    }

    if (!response.ok) {
      throw new Error(`Stream URL resolve failed: ${response.status}`);
    }

    const data = (await response.json()) as { streamUrl?: string; url?: string };
    const streamUrl = data.streamUrl ?? data.url;

    if (!streamUrl) {
      throw new Error("Resolver response missing streamUrl");
    }

    this.streamUrlCache.set(videoId, {
      streamUrl,
      expiresAt: Date.now() + STREAM_URL_CACHE_TTL_MS,
    });
    return streamUrl;
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
}

export const audioEngine = new AudioEngine();
