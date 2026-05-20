"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  Loader2,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Video,
  VideoOff,
  ListMusic,
  Music,
  X,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { usePlayerStore } from "@/store/player-store";
import { audioEngine } from "@/lib/audio-engine";

function formatTime(sec: number) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const MIN_PLAYBACK_LOADING_MS = 400;

export function PlayerBar() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const {
    currentSong,
    isPlaying,
    showVideo,
    showQueue,
    isShuffle,
    repeatMode,
    songs,
    queue,
    currentQueuePos,
    playNext,
    playPrev,
    playAtIndex,
    setIsPlaying,
    toggleShuffle,
    cycleRepeat,
    toggleVideo,
    toggleQueue,
    updateLike,
  } = usePlayerStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const videoPanelRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Draggable video panel ─────────────────────────────────────────────────
  // Position is stored as { right, bottom } offsets from viewport edges
  const [panelPos, setPanelPos] = useState({ right: 20, bottom: 88 });
  const dragState = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  }>({ dragging: false, startX: 0, startY: 0, startRight: 20, startBottom: 88 });

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    // Only drag from the header bar, not from buttons inside it
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startRight: panelPos.right,
      startBottom: panelPos.bottom,
    };
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const panelW = VIDEO_WIDTHS[videoSize];
    const panelH = Math.round(panelW * 0.5625) + 36; // aspect + header
    const newRight = Math.max(0, Math.min(window.innerWidth - panelW, dragState.current.startRight - dx));
    const newBottom = Math.max(72, Math.min(window.innerHeight - panelH, dragState.current.startBottom + dy));
    setPanelPos({ right: newRight, bottom: newBottom });
  }

  function handleDragEnd() {
    dragState.current.dragging = false;
  }
  const VIDEO_WIDTHS: Record<"sm" | "md" | "lg", number> = { sm: 320, md: 500, lg: 700 };
  const VIDEO_SIZE_NEXT: Record<"sm" | "md" | "lg", "sm" | "md" | "lg"> = { sm: "md", md: "lg", lg: "sm" };
  const [videoSize, setVideoSize] = useState<"sm" | "md" | "lg">("sm");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  // Close now-playing drawer when song stops
  useEffect(() => {
    if (!currentSong) setShowNowPlaying(false);
  }, [currentSong]);

  // Close now-playing drawer on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && showNowPlaying) setShowNowPlaying(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showNowPlaying]);

  // When size changes, clamp position so the panel stays on-screen
  useEffect(() => {
    const panelW = VIDEO_WIDTHS[videoSize];
    const panelH = Math.round(panelW * 0.5625) + 36;
    setPanelPos((p) => ({
      right: Math.max(0, Math.min(window.innerWidth - panelW, p.right)),
      bottom: Math.max(72, Math.min(window.innerHeight - panelH, p.bottom)),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSize]);

  // Track native fullscreen state changes
  useEffect(() => {
    function handleFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  function toggleFullscreen() {
    if (!videoPanelRef.current) return;
    if (!document.fullscreenElement) {
      videoPanelRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
  const playbackToggleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackLoadingStartedAtRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [liked, setLiked] = useState(false);
  const [isPlaybackLoading, setIsPlaybackLoading] = useState(false);
  const [isTrackLoading, setIsTrackLoading] = useState(false);
  const [isIframeFallback, setIsIframeFallback] = useState(false);
  const [useDownloadFlowPlayback, setUseDownloadFlowPlayback] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = navigator as Navigator & { standalone?: boolean };
    const media = window.matchMedia("(display-mode: standalone)");
    const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? "");

    const updateMode = () => {
      const isStandalonePwa = media.matches || nav.standalone === true;
      setUseDownloadFlowPlayback(isStandalonePwa || isMobileUa);
    };

    updateMode();
    media.addEventListener?.("change", updateMode);
    return () => {
      media.removeEventListener?.("change", updateMode);
    };
  }, []);

  const clearPlaybackLoading = useCallback(() => {
    const startedAt = playbackLoadingStartedAtRef.current;
    const elapsed = startedAt ? Date.now() - startedAt : MIN_PLAYBACK_LOADING_MS;
    const waitMs = Math.max(0, MIN_PLAYBACK_LOADING_MS - elapsed);

    if (playbackToggleTimeoutRef.current) {
      clearTimeout(playbackToggleTimeoutRef.current);
      playbackToggleTimeoutRef.current = null;
    }

    playbackToggleTimeoutRef.current = setTimeout(() => {
      setIsPlaybackLoading(false);
      playbackLoadingStartedAtRef.current = null;
      playbackToggleTimeoutRef.current = null;
    }, waitMs);
  }, []);

  const ensureIframePlayer = useCallback(async (): Promise<YT.Player> => {
    if (playerRef.current) return playerRef.current;

    if (typeof window === "undefined") {
      throw new Error("YouTube iframe is only available in browser");
    }

    if (!window.YT?.Player) {
      await new Promise<void>((resolve) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          prev?.();
          resolve();
        };

        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
          const tag = document.createElement("script");
          tag.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(tag);
        }
      });
    }

    if (!containerRef.current) {
      throw new Error("Video container not ready");
    }

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: "",
      playerVars: { autoplay: 1, controls: 1, rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onStateChange: (event) => {
          if (event.data === 1) {
            setIsPlaying(true);
            clearPlaybackLoading();
            setIsTrackLoading(false);
            if (!intervalRef.current) {
              intervalRef.current = setInterval(() => {
                const p = playerRef.current;
                if (!p) return;
                const cur = p.getCurrentTime?.() ?? 0;
                const dur = p.getDuration?.() ?? 0;
                setProgress(dur > 0 ? (cur / dur) * 100 : 0);
                setDuration(dur);
              }, 500);
            }
          } else if (event.data === 2) {
            setIsPlaying(false);
            clearPlaybackLoading();
          } else if (event.data === 0) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            setProgress(0);
            playNext();
          }
        },
      },
    });

    return playerRef.current;
  }, [setIsPlaying, clearPlaybackLoading, playNext]);

  const fallbackToIframe = useCallback(async (videoId: string) => {
    setIsIframeFallback(true);
    void audioEngine.syncPlaybackState(false).catch(() => {
      // Best effort pause of native engine before fallback.
    });
    const player = await ensureIframePlayer();
    player.loadVideoById(videoId);
    setTimeout(() => {
      try {
        player.playVideo();
      } catch {
        // player may still be warming up
      }
    }, 50);
  }, [ensureIframePlayer]);

  useEffect(() => {
    if (!mounted) return;

    audioEngine.init();
    audioEngine.setCallbacks({
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
        if (playing) {
          clearPlaybackLoading();
          setIsTrackLoading(false);
        }
      },
      onTimeUpdate: (currentTime, totalDuration) => {
        setDuration(Number.isFinite(totalDuration) ? totalDuration : 0);
        setProgress(totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0);
      },
      onDuration: (totalDuration) => {
        setDuration(Number.isFinite(totalDuration) ? totalDuration : 0);
      },
      onEnded: () => {
        setProgress(0);
        playNext();
      },
      onError: () => {
        setIsTrackLoading(false);
        clearPlaybackLoading();
      },
      onNext: () => playNext(),
      onPrev: () => playPrev(),
    });
  }, [mounted, setIsPlaying, clearPlaybackLoading, playNext, playPrev]);

  const forceResumeIfNeeded = useCallback(() => {
    const shouldPlay = usePlayerStore.getState().isPlaying;
    if (!shouldPlay) return;

    void audioEngine.syncPlaybackState(true).catch(() => {
      // Browser media policies can block this; ignore and retry on next visibility/focus.
    });
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (typeof window === "undefined" || document.hidden) return;

    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return;

    try {
      wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch {
      // Unsupported, denied, or blocked by battery saver.
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return;
    try {
      await wakeLockRef.current.release();
    } catch {
      // ignore
    } finally {
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    function handleVisibility() {
      if (!document.hidden) {
        forceResumeIfNeeded();
        void requestWakeLock();
      }
    }

    function handlePageShow() {
      forceResumeIfNeeded();
      void requestWakeLock();
    }

    function handleFocus() {
      forceResumeIfNeeded();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
    };
  }, [forceResumeIfNeeded, requestWakeLock]);

  useEffect(() => {
    if (!mounted) return;
    if (isPlaying && currentSong) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }
  }, [mounted, isPlaying, currentSong, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    return () => {
      void releaseWakeLock();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (playbackToggleTimeoutRef.current) {
        clearTimeout(playbackToggleTimeoutRef.current);
        playbackToggleTimeoutRef.current = null;
      }
    };
  }, [releaseWakeLock]);

  // YouTube iframe playback has been intentionally disabled.

  useEffect(() => {
    if (!currentSong?.youtube_video_id) return;

    setProgress(0);
    setDuration(0);
    setLiked(currentSong.liked ?? false);
    setIsTrackLoading(true);
    setIsPlaybackLoading(true);
    playbackLoadingStartedAtRef.current = Date.now();

    if (!useDownloadFlowPlayback) {
      void fallbackToIframe(currentSong.youtube_video_id).catch(() => {
        setIsTrackLoading(false);
        clearPlaybackLoading();
        setIsPlaying(false);
      });
      return;
    }

    setIsIframeFallback(false);

    void audioEngine
      .playSong(currentSong)
      .then(() => {
        setIsIframeFallback(false);
        setIsTrackLoading(false);
        clearPlaybackLoading();
      })
      .catch(async () => {
        if (!currentSong.youtube_video_id) {
          setIsTrackLoading(false);
          clearPlaybackLoading();
          setIsPlaying(false);
          return;
        }

        try {
          await fallbackToIframe(currentSong.youtube_video_id);
        } catch {
          setIsTrackLoading(false);
          clearPlaybackLoading();
          setIsPlaying(false);
        }
      });
  }, [
    currentSong?.youtube_video_id,
    currentSong?.id,
    currentSong,
    clearPlaybackLoading,
    setIsPlaying,
    fallbackToIframe,
    useDownloadFlowPlayback,
  ]);

  useEffect(() => {
    setLiked(currentSong?.liked ?? false);
  }, [currentSong?.liked]);

  useEffect(() => {
    if (!useDownloadFlowPlayback) return;
    if (!currentSong) return;

    const nextSongIndex = queue[currentQueuePos + 1];
    const nextSong = nextSongIndex != null ? songs[nextSongIndex] : null;
    audioEngine.setNextTrack(nextSong ?? null);
  }, [currentSong, queue, currentQueuePos, songs, useDownloadFlowPlayback]);

  useEffect(() => {
    if (!useDownloadFlowPlayback) return;
    const upcomingSongs = queue
      .slice(currentQueuePos + 1)
      .map((songIndex) => songs[songIndex])
      .filter((song): song is NonNullable<typeof song> => Boolean(song));

    void audioEngine.preloadQueueTracks(upcomingSongs);
  }, [queue, currentQueuePos, songs, useDownloadFlowPlayback]);

  useEffect(() => {
    if (!useDownloadFlowPlayback) return;
    if (!currentSong) return;
    if (isIframeFallback) return;
    void audioEngine.syncPlaybackState(isPlaying).catch(() => {
      // Best effort only.
    });
  }, [isPlaying, currentSong, isIframeFallback, useDownloadFlowPlayback]);

  useEffect(() => {
    if (!currentSong || !isIframeFallback || !playerRef.current) return;
    try {
      if (isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    } catch {
      // Ignore transient iframe state errors.
    }
  }, [isPlaying, currentSong, isIframeFallback]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (isIframeFallback && playerRef.current) {
      playerRef.current.seekTo(pct * duration, true);
    } else {
      audioEngine.seekTo(pct * duration);
    }
    setProgress(pct * 100);
  }

  async function handleLike() {
    if (!currentSong) return;
    const newLiked = !liked;
    setLiked(newLiked);
    updateLike(currentSong.id, newLiked);
    try {
      const res = await fetch(`/api/songs/${currentSong.id}/like`, { method: "PATCH" });
      if (!res.ok) throw new Error("Request failed");
      router.refresh();
    } catch {
      setLiked(!newLiked);
      updateLike(currentSong.id, !newLiked);
    }
  }

  function handlePlayPauseToggle() {
    if (!currentSong) return;

    playbackLoadingStartedAtRef.current = Date.now();
    setIsPlaybackLoading(true);
    if (playbackToggleTimeoutRef.current) {
      clearTimeout(playbackToggleTimeoutRef.current);
    }

    playbackToggleTimeoutRef.current = setTimeout(() => {
      setIsPlaybackLoading(false);
      playbackToggleTimeoutRef.current = null;
    }, 2500);

    setIsPlaying(!isPlaying);
  }

  const currentTime = duration > 0 ? (progress / 100) * duration : 0;

  // Prevent SSR/client mismatch when persisted player state exists only on client.
  if (!mounted) return null;

  return (
    <>
      {currentSong && <div aria-hidden className="h-16" />}

      {/* ── Now-playing full-screen drawer (mobile only) ──────────────── */}
      <div
        className={`fixed inset-0 z-[55] flex flex-col overflow-hidden bg-gradient-to-b from-[#0d1a2b] to-[#04070d] sm:hidden transition-transform duration-300 ease-out ${
          showNowPlaying && currentSong ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
      >
        {/* Drag-handle + header */}
        <div className="flex flex-col items-center px-5 pt-3">
          <button
            onClick={() => setShowNowPlaying(false)}
            className="flex h-8 w-full items-center justify-center"
            aria-label="Close"
          >
            <div className="h-1 w-12 rounded-full bg-white/25" />
          </button>
          <div className="flex w-full items-center justify-between py-1">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Now Playing</p>
            <button
              onClick={() => setShowNowPlaying(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-white"
            >
              <ChevronDown size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 pb-8">
          {/* Artwork */}
          <div className="mt-4 aspect-square w-full overflow-hidden rounded-2xl bg-slate-800 shadow-[0_24px_56px_rgba(0,0,0,0.7)]">
            {currentSong?.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentSong.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music size={64} className="text-slate-600" />
              </div>
            )}
          </div>

          {/* Song info + like */}
          <div className="mt-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[1.15rem] font-bold leading-snug text-white">
                {currentSong?.title ?? "—"}
              </p>
              <p className="mt-0.5 text-sm text-slate-400">{currentSong?.artist ?? ""}</p>
            </div>
            <button
              onClick={handleLike}
              className={`mt-0.5 shrink-0 transition-transform active:scale-90 ${
                liked ? "text-rose-400" : "text-slate-500"
              }`}
            >
              <Heart size={24} className={liked ? "fill-rose-400" : ""} />
            </button>
          </div>

          {/* Progress scrubber */}
          <div className="mt-5">
            <div
              className="h-1.5 w-full cursor-pointer rounded-full bg-white/15"
              onClick={handleProgressClick}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-slate-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Main playback controls */}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={toggleShuffle}
              className={`flex h-11 w-11 items-center justify-center ${
                isShuffle ? "text-cyan-400" : "text-slate-500"
              }`}
            >
              <Shuffle size={22} />
            </button>
            <button
              onClick={playPrev}
              className="flex h-12 w-12 items-center justify-center text-white"
            >
              <SkipBack size={30} />
            </button>
            <button
              onClick={handlePlayPauseToggle}
              disabled={isPlaybackLoading || isTrackLoading}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform active:scale-95"
            >
              {isPlaybackLoading || isTrackLoading ? (
                <Loader2 size={24} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={26} />
              ) : (
                <Play size={26} className="ml-1" />
              )}
            </button>
            <button
              onClick={playNext}
              className="flex h-12 w-12 items-center justify-center text-white"
            >
              <SkipForward size={30} />
            </button>
            <button
              onClick={cycleRepeat}
              className={`flex h-11 w-11 items-center justify-center ${
                repeatMode !== "off" ? "text-cyan-400" : "text-slate-500"
              }`}
            >
              {repeatMode === "one" ? <Repeat1 size={22} /> : <Repeat size={22} />}
            </button>
          </div>

          {/* Extra controls row */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              onClick={() => { setShowNowPlaying(false); toggleQueue(); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm transition-all ${
                showQueue
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              <ListMusic size={16} />
              Queue
            </button>
            <button
              onClick={() => { setShowNowPlaying(false); toggleVideo(); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm transition-all ${
                showVideo
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              <Video size={16} />
              Video
            </button>
          </div>
        </div>
      </div>

      {/* YouTube iframe is available only as a fallback if MP3 methods fail. */}
      <div
        ref={videoPanelRef}
        className="fixed z-50 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl"
        style={{
          width: Math.min(VIDEO_WIDTHS[videoSize], typeof window !== "undefined" ? window.innerWidth - 8 : VIDEO_WIDTHS[videoSize]),
          bottom: showVideo && currentSong ? panelPos.bottom : -(VIDEO_WIDTHS[videoSize] * 0.65 + 60),
          right: isFullscreen ? 0 : Math.max(4, panelPos.right),
          opacity: showVideo && currentSong ? 1 : 0,
          pointerEvents: showVideo && currentSong ? "auto" : "none",
          transition: "opacity 0.2s, bottom 0.2s",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <div
          className="flex cursor-grab items-center gap-2 border-b border-white/10 bg-black/80 px-3 py-2 backdrop-blur-sm active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-300">
            {currentSong?.title ?? ""}
          </p>
          <button
            onClick={() => setVideoSize((s) => VIDEO_SIZE_NEXT[s])}
            title={`Size: ${videoSize.toUpperCase()} — click to change`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-white"
          >
            {videoSize === "lg" ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-white"
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={toggleVideo}
            title="Hide video"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
        {isIframeFallback ? (
          <div ref={containerRef} className="aspect-video w-full" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center px-4 text-center text-xs text-slate-400">
            MP3 cache/direct methods are active. YouTube iframe will be used automatically as fallback.
          </div>
        )}
      </div>

      {/* ── Queue panel — slides up above the player bar ─────────────── */}
      <div
        className={`fixed left-0 right-0 z-40 border-t border-white/8 bg-[#04070d]/97 backdrop-blur-2xl transition-all duration-300 ease-in-out ${
          showQueue && currentSong ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        style={{ bottom: 72 }}
      >
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Queue · {queue.filter((i) => songs[i]?.youtube_video_id).length} playable
            </p>
            <button
              onClick={toggleQueue}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/8 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto pb-3">
            {queue.map((songIndex, queueIdx) => {
              const s = songs[songIndex];
              // Only show songs that have a YouTube match
              if (!s || !s.youtube_video_id) return null;
              const isCurrent = queueIdx === currentQueuePos;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    playAtIndex(songIndex);
                    toggleQueue();
                  }}
                  className={`flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-white/5 ${
                    isCurrent ? "bg-white/[0.04]" : ""
                  }`}
                >
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-800">
                    {s.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music size={14} className="text-slate-600" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-medium ${
                        isCurrent ? "text-cyan-300" : "text-white"
                      }`}
                    >
                      {s.title}
                    </p>
                    <p className="truncate text-xs text-slate-500">{s.artist}</p>
                  </div>
                  {isCurrent && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                      Playing
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom player bar ─────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 border-t border-white/8 bg-[#04070d]/95 backdrop-blur-2xl transition-transform duration-300 ${
          currentSong ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Seekable progress bar */}
        <div
          className="group/seek h-1 w-full cursor-pointer bg-white/10 transition-all hover:h-1.5"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4">
          {/* Song info — tap on mobile opens now-playing drawer */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowNowPlaying(true)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left sm:cursor-default sm:pointer-events-none sm:gap-3"
            >
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-800 sm:h-10 sm:w-10">
                {currentSong?.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentSong.thumbnail}
                    alt={currentSong?.title ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music size={16} className="text-slate-600" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold leading-tight text-white sm:text-sm">
                  {currentSong?.title ?? "—"}
                </p>
                <p className="truncate text-[11px] text-slate-400 sm:text-xs">{currentSong?.artist ?? ""}</p>
              </div>
            </button>
            <button
              onClick={handleLike}
              title={liked ? "Unlike" : "Like"}
              className={`ml-1 hidden shrink-0 transition-all hover:scale-110 sm:block ${
                liked ? "text-rose-400" : "text-slate-600 hover:text-slate-300"
              }`}
            >
              <Heart size={16} className={liked ? "fill-rose-400" : ""} />
            </button>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              onClick={toggleShuffle}
              title="Shuffle"
              className={`hidden h-8 w-8 items-center justify-center rounded-lg transition-colors sm:flex ${
                isShuffle ? "text-cyan-400" : "text-slate-500 hover:text-white"
              }`}
            >
              <Shuffle size={16} />
            </button>
            <button
              onClick={playPrev}
              title="Previous"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
            >
              <SkipBack size={18} />
            </button>
            <button
              onClick={handlePlayPauseToggle}
              disabled={isPlaybackLoading || isTrackLoading}
              title={isPlaying ? "Pause" : "Play"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 sm:h-10 sm:w-10"
            >
              {isPlaybackLoading || isTrackLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={17} />
              ) : (
                <Play size={17} className="ml-0.5" />
              )}
            </button>
            <button
              onClick={playNext}
              title="Next"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
            >
              <SkipForward size={18} />
            </button>
            <button
              onClick={cycleRepeat}
              title={`Repeat: ${repeatMode}`}
              className={`hidden h-8 w-8 items-center justify-center rounded-lg transition-colors sm:flex ${
                repeatMode !== "off" ? "text-cyan-400" : "text-slate-500 hover:text-white"
              }`}
            >
              {repeatMode === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

          {/* Right controls */}
          <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
            <span className="hidden text-xs tabular-nums text-slate-500 sm:block">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <button
              onClick={handleLike}
              title={liked ? "Unlike" : "Like"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center sm:hidden ${
                liked ? "text-rose-400" : "text-slate-600"
              }`}
            >
              <Heart size={16} className={liked ? "fill-rose-400" : ""} />
            </button>
            <button
              onClick={toggleQueue}
              title="Queue"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                showQueue
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <ListMusic size={15} />
            </button>
            <button
              onClick={toggleVideo}
              title={showVideo ? "Hide video" : "Show video"}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                showVideo
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {showVideo ? <VideoOff size={15} /> : <Video size={15} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
