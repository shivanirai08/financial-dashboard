import { type EmitterSubscription } from "react-native";
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
  type PlaybackState,
} from "react-native-track-player";
import type { DbSong } from "@/types";
import { appEnv } from "@/env";

type PlayerCallbacks = {
  onPlayStateChange?: (playing: boolean, state: PlaybackState["state"]) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onDuration?: (duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  onRemotePlay?: () => void;
  onRemotePause?: () => void;
  onRemoteNext?: () => void;
  onRemotePrev?: () => void;
};

type ProviderName = "youtube-mp36" | "youtube-mp3-2025";

const STREAM_URL_CACHE_TTL_MS = 60 * 60 * 1000;

class NativeAudioController {
  private callbacks: PlayerCallbacks = {};
  private currentSongId: string | null = null;
  private currentVideoId: string | null = null;
  private streamUrlCache = new Map<string, { streamUrl: string; expiresAt: number }>();
  private nextVideoId: string | null = null;
  private isInitialized = false;
  private listeners: EmitterSubscription[] = [];

  async init() {
    if (this.isInitialized) {
      return;
    }

    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.SeekTo,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.SeekTo,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      progressUpdateEventInterval: 1,
    });

    this.listeners = [
      TrackPlayer.addEventListener(Event.PlaybackState, (payload) => {
        const playing = payload.state === State.Playing;
        this.callbacks.onPlayStateChange?.(playing, payload.state);
      }),
      TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (payload) => {
        this.callbacks.onTimeUpdate?.(payload.position, payload.duration);
        this.callbacks.onDuration?.(payload.duration);
      }),
      TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
        this.callbacks.onEnded?.();
      }),
      TrackPlayer.addEventListener(Event.PlaybackError, (payload) => {
        this.callbacks.onError?.(new Error(payload.message));
      }),
      TrackPlayer.addEventListener(Event.RemotePlay, () => {
        this.callbacks.onRemotePlay?.();
      }),
      TrackPlayer.addEventListener(Event.RemotePause, () => {
        this.callbacks.onRemotePause?.();
      }),
      TrackPlayer.addEventListener(Event.RemoteNext, () => {
        this.callbacks.onRemoteNext?.();
      }),
      TrackPlayer.addEventListener(Event.RemotePrevious, () => {
        this.callbacks.onRemotePrev?.();
      }),
      TrackPlayer.addEventListener(Event.RemoteSeek, (payload) => {
        void this.seekTo(payload.position);
      }),
    ];

    this.isInitialized = true;
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

    await TrackPlayer.reset();
    await TrackPlayer.add({
      id: song.id,
      url: streamUrl,
      title: song.title,
      artist: song.artist,
      artwork: song.thumbnail ?? undefined,
      duration: song.duration ?? undefined,
    });
    await TrackPlayer.play();

    this.currentSongId = song.id;
    this.currentVideoId = videoId;
  }

  async syncPlaybackState(shouldPlay: boolean) {
    if (shouldPlay) {
      await TrackPlayer.play();
    } else {
      await TrackPlayer.pause();
    }
  }

  async seekTo(seconds: number) {
    await TrackPlayer.seekTo(seconds);
  }

  async stop() {
    await TrackPlayer.stop();
    await TrackPlayer.reset();
    this.currentSongId = null;
    this.currentVideoId = null;
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
