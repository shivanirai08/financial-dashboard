import {
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import { Platform } from "react-native";
import type { DbSong } from "@/types";
import { appEnv } from "@/env";

type PlayerCallbacks = {
  onPlayStateChange?: (playing: boolean) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onDuration?: (duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
};

type ProviderName = "youtube-mp36" | "youtube-mp3-2025";

const STREAM_URL_CACHE_TTL_MS = 60 * 60 * 1000;

class NativeAudioController {
  private player: AudioPlayer | null = null;
  private callbacks: PlayerCallbacks = {};
  private currentSongId: string | null = null;
  private currentVideoId: string | null = null;
  private currentTrack: DbSong | null = null;
  private streamUrlCache = new Map<string, { streamUrl: string; expiresAt: number }>();
  private nextVideoId: string | null = null;
  private initialized = false;
  private statusSubscription: { remove: () => void } | null = null;

  async init() {
    if (this.initialized && this.player) return;

    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      shouldRouteThroughEarpiece: false,
    });

    if (Platform.OS === "android") {
      try {
        await requestNotificationPermissionsAsync();
      } catch {
        // Best effort only.
      }
    }

    this.player = createAudioPlayer(null, {
      updateInterval: 1000,
    });
    this.statusSubscription = this.player.addListener(
      "playbackStatusUpdate",
      this.handleStatusUpdate
    );
    this.initialized = true;
  }

  setCallbacks(callbacks: PlayerCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setNextTrack(song: DbSong | null) {
    this.nextVideoId = song?.youtube_video_id ?? null;
    if (this.nextVideoId) {
      void this.resolveStreamUrl(this.nextVideoId).catch(() => {
        // Best-effort pre-resolve only.
      });
    }
  }

  async playSong(song: DbSong) {
    if (!song.youtube_video_id) {
      throw new Error("Song has no YouTube video id");
    }

    await this.init();
    const videoId = song.youtube_video_id;
    const streamUrl = await this.resolveStreamUrl(videoId);

    if (!this.player) {
      throw new Error("Audio player failed to initialize");
    }

    this.currentTrack = song;
    this.currentSongId = song.id;
    this.currentVideoId = videoId;

    this.player.replace({
      uri: streamUrl,
      headers: {
        "User-Agent": "Pulsebox",
      },
      name: song.title,
    });
    this.activateLockScreen(song);
    this.player.play();
  }

  async syncPlaybackState(shouldPlay: boolean) {
    if (!this.player) return;
    if (shouldPlay) {
      this.player.play();
    } else {
      this.player.pause();
    }
  }

  async seekTo(seconds: number) {
    if (!this.player) return;
    await this.player.seekTo(seconds);
  }

  async stop() {
    if (!this.player) return;
    this.player.pause();
    this.player.clearLockScreenControls();
    this.statusSubscription?.remove();
    this.statusSubscription = null;
    this.player.remove();
    this.player = null;
    this.currentSongId = null;
    this.currentVideoId = null;
    this.currentTrack = null;
    this.initialized = false;
  }

  private handleStatusUpdate = (status: AudioStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        this.callbacks.onError?.(new Error(status.error));
      }
      return;
    }

    this.callbacks.onPlayStateChange?.(status.playing);
    this.callbacks.onTimeUpdate?.(status.currentTime, status.duration ?? 0);
    if (status.duration) {
      this.callbacks.onDuration?.(status.duration);
    }

    if (this.currentTrack && this.player) {
      this.player.updateLockScreenMetadata({
        title: this.currentTrack.title,
        artist: this.currentTrack.artist ?? "Pulsebox",
        artworkUrl: this.currentTrack.thumbnail ?? undefined,
      });
    }

    if (status.didJustFinish) {
      this.callbacks.onEnded?.();
    }
  };

  private activateLockScreen(song: DbSong) {
    if (!this.player) return;

    this.player.setActiveForLockScreen(
      true,
      {
        title: song.title,
        artist: song.artist ?? "Pulsebox",
        artworkUrl: song.thumbnail ?? undefined,
      },
      {
        showSeekBackward: true,
        showSeekForward: true,
      }
    );
  }

  private async resolveStreamUrl(videoId: string) {
    const cached = this.streamUrlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.streamUrl;
    }

    const providerOrder = appEnv.rapidApiProviderOrder
      .split(",")
      .map((item) => item.trim())
      .filter(
        (item): item is ProviderName =>
          item === "youtube-mp36" || item === "youtube-mp3-2025"
      );

    const failures: string[] = [];

    for (const provider of providerOrder) {
      try {
        const streamUrl =
          provider === "youtube-mp36"
            ? await this.fetchFromMp36(videoId)
            : await this.fetchFromMp32025(videoId);
        this.streamUrlCache.set(videoId, {
          streamUrl,
          expiresAt: Date.now() + STREAM_URL_CACHE_TTL_MS,
        });
        return streamUrl;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(`Failed to resolve MP3 stream (${failures.join(" | ")})`);
  }

  private async fetchFromMp36(videoId: string) {
    const response = await fetch(
      `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "youtube-mp36.p.rapidapi.com",
          "x-rapidapi-key": appEnv.rapidApiKeyPrimary,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`youtube-mp36 failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      status?: string;
      link?: string;
      msg?: string;
    };
    if (payload.status !== "ok" || !payload.link) {
      throw new Error(payload.msg ?? "youtube-mp36 returned no link");
    }

    return payload.link;
  }

  private async fetchFromMp32025(videoId: string) {
    const response = await fetch(
      "https://youtube-mp3-2025.p.rapidapi.com/v1/social/youtube/audio",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "youtube-mp3-2025.p.rapidapi.com",
          "x-rapidapi-key": appEnv.rapidApiKeySecondary,
        },
        body: JSON.stringify({ id: videoId }),
      }
    );

    if (!response.ok) {
      throw new Error(`youtube-mp3-2025 failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      error?: boolean;
      linkStream?: string;
      linkDownload?: string;
    };

    const streamUrl = payload.linkStream ?? payload.linkDownload;
    if (payload.error || !streamUrl) {
      throw new Error("youtube-mp3-2025 returned no stream link");
    }

    return streamUrl;
  }
}

export const nativeAudioController = new NativeAudioController();
