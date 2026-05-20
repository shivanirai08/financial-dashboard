"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
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
  Loader2,
} from "lucide-react";
import { usePlayerStore } from "@/store/player-store";
import {
  getPersistentAudio,
  primeAudioOnGesture,
  setAudioCallbacks,
  updateMediaSessionMetadata,
} from "@/lib/audio-manager";

// ─── NOTE ON THE THREE FIXES ──────────────────────────────────────────────────
//
// FIX 1 — beforeinstallprompt / install prompt stopping audio:
//   audio-manager.ts captures the event at MODULE LOAD TIME via addEventListener.
//   This means it is captured before any React component mounts, before any song
//   plays, and e.preventDefault() stops Chrome's native mini-infobar from ever
//   auto-appearing mid-playback.
//
// FIX 2 — Second song stops + no lock screen:
//   a) We call updateMediaSessionMetadata() synchronously inside the song-load
//      useEffect, BEFORE the fetch starts. No gap where lock screen is blank.
//   b) We call setAudioCallbacks() to update the module-level refs. MediaSession
//      action handlers were registered ONCE in audio-manager.ts and never torn
//      down — they always point to the latest callbacks via those refs.
//   c) We do NOT call audio.load() after setting audio.src. audio.load() resets
//      the gesture token, causing song 2 to be treated as unauthorized autoplay.
//
// FIX 3 — Screen off / home button stops playback:
//   The audio element is appended to document.body in getPersistentAudio().
//   MediaSession handlers stay registered at all times. Chrome Android keeps
//   background audio alive when both of these conditions are true.
//
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(sec: number) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STREAM_BACKEND_BASE =
  process.env.NEXT_PUBLIC_STREAM_BACKEND_URL?.replace(/\/$/, "") ?? "";

function getStreamEndpoint(videoId: string) {
  if (STREAM_BACKEND_BASE) {
    return `${STREAM_BACKEND_BASE}/api/stream/${videoId}`;
  }
  return `/api/stream/${videoId}`;
}

type AudioListener = {
  event: keyof HTMLMediaElementEventMap;
  handler: EventListener;
};

export function PlayerBar() {
  const NATIVE_STREAM_DISABLED_KEY = "pulsebox_native_stream_disabled";
  const NATIVE_STREAM_FAIL_COUNT_KEY = "pulsebox_native_stream_fail_count";
  const NATIVE_STREAM_FAIL_THRESHOLD = 3;

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

  // ── Draggable video panel ─────────────────────────────────────────────────
  const [panelPos, setPanelPos] = useState({ right: 20, bottom: 88 });
  const dragState = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  }>({ dragging: false, startX: 0, startY: 0, startRight: 20, startBottom: 88 });

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
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
    const panelH = Math.round(panelW * 0.5625) + 36;
    const newRight = Math.max(
      0,
      Math.min(window.innerWidth - panelW, dragState.current.startRight - dx)
    );
    const newBottom = Math.max(
      72,
      Math.min(window.innerHeight - panelH, dragState.current.startBottom + dy)
    );
    setPanelPos({ right: newRight, bottom: newBottom });
  }

  function handleDragEnd() {
    dragState.current.dragging = false;
  }

  const VIDEO_WIDTHS: Record<"sm" | "md" | "lg", number> = {
    sm: 320,
    md: 500,
    lg: 700,
  };
  const VIDEO_SIZE_NEXT: Record<"sm" | "md" | "lg", "sm" | "md" | "lg"> = {
    sm: "md",
    md: "lg",
    lg: "sm",
  };
  const [videoSize, setVideoSize] = useState<"sm" | "md" | "lg">("sm");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  useEffect(() => {
    if (!currentSong) setShowNowPlaying(false);
  }, [currentSong]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && showNowPlaying) setShowNowPlaying(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showNowPlaying]);

  useEffect(() => {
    const panelW = VIDEO_WIDTHS[videoSize];
    const panelH = Math.round(panelW * 0.5625) + 36;
    setPanelPos((p) => ({
      right: Math.max(0, Math.min(window.innerWidth - panelW, p.right)),
      bottom: Math.max(72, Math.min(window.innerHeight - panelH, p.bottom)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSize]);

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

  // ── Refs ──────────────────────────────────────────────────────────────────
  const playerRef = useRef<YT.Player | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable refs for queue callbacks — we point MediaSession handlers at these
  // so we never need to re-register the handlers when queue/index changes.
  const playNextRef = useRef(playNext);
  const playPrevRef = useRef(playPrev);
  playNextRef.current = playNext;
  playPrevRef.current = playPrev;

  // Whether native <audio> is handling playback (vs iframe fallback)
  const usingNativeAudioRef = useRef(false);
  const isLoadingVideoRef = useRef(false);
  const tabHiddenRef = useRef(false);
  const audioListenersRef = useRef<AudioListener[]>([]);
  const nativeStreamDisabledRef = useRef(false);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [liked, setLiked] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Ensure the audio element exists and is in the DOM from the first mount
    getPersistentAudio();

    try {
      nativeStreamDisabledRef.current =
        window.sessionStorage.getItem(NATIVE_STREAM_DISABLED_KEY) === "1";

      // If we are explicitly using an external stream backend, clear any stale
      // session disable flags so native streaming can retry after migrations.
      if (STREAM_BACKEND_BASE) {
        window.sessionStorage.removeItem(NATIVE_STREAM_DISABLED_KEY);
        window.sessionStorage.removeItem(NATIVE_STREAM_FAIL_COUNT_KEY);
        nativeStreamDisabledRef.current = false;
      }
    } catch {
      nativeStreamDisabledRef.current = false;
    }
  }, []);

  // ── Wire up module-level audio callbacks ──────────────────────────────────
  // This replaces re-registering MediaSession handlers in useEffect.
  // We just update the refs; the handlers in audio-manager.ts always read
  // the latest values through the module-level refs.
  useEffect(() => {
    setAudioCallbacks({
      onNext: () => playNextRef.current(),
      onPrev: () => playPrevRef.current(),
      onEnded: () => {
        setProgress(0);
        playNextRef.current();
      },
    });
  }, []); // only on mount — the refs always stay current

  // ── Visibility change ─────────────────────────────────────────────────────
  useEffect(() => {
    function handleVisibility() {
      tabHiddenRef.current = document.hidden;
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ── YouTube IFrame API — VIDEO DISPLAY ONLY ───────────────────────────────
  const initPlayer = useCallback(() => {
    if (!containerRef.current || playerRef.current) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: "",
      playerVars: {
        autoplay: 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onStateChange(event) {
          // When native audio is active, iframe is visual-only — keep it muted
          if (usingNativeAudioRef.current) {
            try {
              (playerRef.current as unknown as { mute: () => void })?.mute();
            } catch { /* ignore */ }
            return;
          }
          // Fallback mode: iframe handles audio (when native audio fails)
          if (event.data === 1) {
            isLoadingVideoRef.current = false;
            setIsPlaying(true);
            if ("mediaSession" in navigator) {
              try { navigator.mediaSession.playbackState = "playing"; } catch { /* ignore */ }
            }
            if (!intervalRef.current) {
              intervalRef.current = setInterval(() => {
                const p = playerRef.current;
                if (!p) return;
                const cur = p.getCurrentTime?.() ?? 0;
                const dur = p.getDuration?.() ?? 0;
                setProgress(dur > 0 ? (cur / dur) * 100 : 0);
                setDuration(dur);
                if ("mediaSession" in navigator && dur > 0) {
                  try {
                    navigator.mediaSession.setPositionState({
                      duration: dur,
                      playbackRate: 1,
                      position: Math.min(cur, dur),
                    });
                  } catch { /* ignore */ }
                }
              }, 500);
            }
          } else if (event.data === 2) {
            if (!tabHiddenRef.current) setIsPlaying(false);
          } else if (event.data === 0) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            setProgress(0);
            playNextRef.current();
          }
        },
      },
    });
  }, [setIsPlaying]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [initPlayer]);

  // ── MediaSession playback state sync ─────────────────────────────────────
  // IMPORTANT: We only sync playbackState here, NOT metadata and NOT handlers.
  // Metadata is set synchronously in the song-load effect below.
  // Handlers are set once in audio-manager.ts and never changed.
  useEffect(() => {
    if (!mounted || !("mediaSession" in navigator)) return;
    if (currentSong) {
      try {
        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      } catch { /* ignore */ }
    } else {
      try {
        navigator.mediaSession.playbackState = "none";
      } catch { /* ignore */ }
    }
  }, [mounted, isPlaying, currentSong]);

  // ── Load new song when currentSong changes ────────────────────────────────
  useEffect(() => {
    if (!currentSong?.youtube_video_id) return;
    const videoId = currentSong.youtube_video_id;
    const songId = currentSong.id;

    setProgress(0);
    setDuration(0);
    setLiked(currentSong.liked ?? false);
    setAudioLoading(true);

    // ── FIX 2a: Update lock screen metadata IMMEDIATELY, before fetch ────
    // This keeps the notification alive continuously between song changes.
    updateMediaSessionMetadata({
      title: currentSong.title,
      artist: currentSong.artist ?? undefined,
      thumbnail: currentSong.thumbnail ?? undefined,
    });

    const abortController = new AbortController();

    function markNativeStreamFailure() {
      try {
        const nextFailCount =
          Number(window.sessionStorage.getItem(NATIVE_STREAM_FAIL_COUNT_KEY) ?? "0") + 1;
        window.sessionStorage.setItem(NATIVE_STREAM_FAIL_COUNT_KEY, String(nextFailCount));
        if (nextFailCount >= NATIVE_STREAM_FAIL_THRESHOLD) {
          window.sessionStorage.setItem(NATIVE_STREAM_DISABLED_KEY, "1");
          nativeStreamDisabledRef.current = true;
          console.warn("[player] Native stream disabled for this session after repeated failures");
        }
      } catch {
        // ignore storage failures
      }
    }

    function clearNativeStreamFailures() {
      try {
        window.sessionStorage.removeItem(NATIVE_STREAM_FAIL_COUNT_KEY);
      } catch {
        // ignore storage failures
      }
    }

    async function loadNativeAudio() {
      try {
        if (nativeStreamDisabledRef.current) {
          fallbackToIframe();
          return;
        }

        const streamEndpoint = getStreamEndpoint(videoId);
        const res = await fetch(streamEndpoint, {
          signal: abortController.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No stream body");

        if (abortController.signal.aborted) return;
        if (usePlayerStore.getState().currentSong?.id !== songId) return;

        const audio = getPersistentAudio();
        usingNativeAudioRef.current = true;

        // Clear previously registered native-audio listeners before attaching
        // a new set for the next track to avoid duplicate callbacks.
        for (const { event, handler } of audioListenersRef.current) {
          audio.removeEventListener(event, handler);
        }
        audioListenersRef.current = [];

        // ── FIX 2b: src swap only — DO NOT call audio.load() ────────────
        // audio.load() resets the user-gesture unlock. Setting src directly
        // preserves the gesture token from the first user tap.
        audio.src = streamEndpoint;
        // audio.load() — ← INTENTIONALLY REMOVED — this was the root cause

        const onPlay = () => {
          if (usePlayerStore.getState().currentSong?.id === songId) {
            setIsPlaying(true);
            if ("mediaSession" in navigator) {
              try { navigator.mediaSession.playbackState = "playing"; } catch { /* ignore */ }
            }
          }
        };
        const onPause = () => {
          if (usePlayerStore.getState().currentSong?.id === songId) {
            setIsPlaying(false);
            if ("mediaSession" in navigator) {
              try { navigator.mediaSession.playbackState = "paused"; } catch { /* ignore */ }
            }
          }
        };
        const onEnded = () => {
          setProgress(0);
          playNextRef.current();
        };
        const onTimeUpdate = () => {
          const cur = audio.currentTime;
          const dur = audio.duration;
          if (dur > 0 && isFinite(dur)) {
            setProgress((cur / dur) * 100);
            setDuration(dur);
            // Update position state for lock screen seekbar (critical for background)
            if ("mediaSession" in navigator) {
              try {
                navigator.mediaSession.setPositionState({
                  duration: dur,
                  playbackRate: 1,
                  position: Math.min(cur, dur),
                });
              } catch { /* setPositionState can throw on older Android */ }
            }
          }
        };
        const onLoadedMetadata = () => {
          if (audio.duration && isFinite(audio.duration)) {
            setDuration(audio.duration);
          }
        };
        const onError = (e: Event) => {
          const audio = e.target as HTMLAudioElement;
          console.warn(`[player] Audio error: ${audio.error?.message || 'unknown'}, trying fallback`);
          usingNativeAudioRef.current = false;
          for (const { event, handler } of audioListenersRef.current) {
            audio.removeEventListener(event, handler);
          }
          audioListenersRef.current = [];
          fallbackToIframe();
        };

        const listeners: AudioListener[] = [
          { event: "play", handler: onPlay as EventListener },
          { event: "pause", handler: onPause as EventListener },
          { event: "ended", handler: onEnded as EventListener },
          { event: "timeupdate", handler: onTimeUpdate as EventListener },
          { event: "loadedmetadata", handler: onLoadedMetadata as EventListener },
          { event: "error", handler: onError as EventListener },
        ];
        for (const { event, handler } of listeners) {
          audio.addEventListener(event, handler);
        }
        audioListenersRef.current = listeners;

        await audio.play();
        clearNativeStreamFailures();
        setAudioLoading(false);

        // If video panel is showing, load the video muted for visuals
        if (usePlayerStore.getState().showVideo && playerRef.current) {
          (playerRef.current as unknown as { mute: () => void }).mute();
          playerRef.current.loadVideoById(videoId);
        }

      } catch (err) {
        if (abortController.signal.aborted) return;
        markNativeStreamFailure();
        console.warn("[player] Native audio fetch failed, falling back to iframe:", err);
        fallbackToIframe();
      }
    }

    function fallbackToIframe() {
      usingNativeAudioRef.current = false;
      setAudioLoading(false);
      if (playerRef.current) {
        isLoadingVideoRef.current = true;
        (playerRef.current as unknown as { unMute: () => void }).unMute();
        playerRef.current.loadVideoById(videoId);
      }
    }

    loadNativeAudio();

    return () => {
      abortController.abort();
      const audio = getPersistentAudio();
      for (const { event, handler } of audioListenersRef.current) {
        audio.removeEventListener(event, handler);
      }
      audioListenersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.youtube_video_id, currentSong?.id]);

  // When video panel is toggled on while native audio plays, load video muted
  useEffect(() => {
    if (!showVideo || !currentSong?.youtube_video_id || !playerRef.current) return;
    if (usingNativeAudioRef.current) {
      (playerRef.current as unknown as { mute: () => void }).mute();
      playerRef.current.loadVideoById(currentSong.youtube_video_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVideo]);

  useEffect(() => {
    setLiked(currentSong?.liked ?? false);
  }, [currentSong?.liked]);

  // Sync play/pause state from store → audio element
  useEffect(() => {
    if (!currentSong) return;
    if (usingNativeAudioRef.current) {
      const audio = getPersistentAudio();
      if (!audio) return;
      if (isPlaying && audio.paused && audio.src) {
        audio.play().catch(() => {});
      } else if (!isPlaying && !audio.paused) {
        audio.pause();
      }
    } else {
      if (!playerRef.current) return;
      if (!isPlaying && tabHiddenRef.current) return;
      try {
        if (isPlaying) playerRef.current.playVideo();
        else playerRef.current.pauseVideo();
      } catch { /* player may not be ready */ }
    }
  }, [isPlaying, currentSong]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = pct * duration;

    if (usingNativeAudioRef.current) {
      const audio = getPersistentAudio();
      if (audio) audio.currentTime = seekTime;
    } else if (playerRef.current) {
      playerRef.current.seekTo(seekTime, true);
    }
    setProgress(pct * 100);

    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(seekTime, duration),
        });
      } catch { /* ignore */ }
    }
  }

  async function handleLike() {
    if (!currentSong) return;
    const newLiked = !liked;
    setLiked(newLiked);
    updateLike(currentSong.id, newLiked);
    try {
      const res = await fetch(`/api/songs/${currentSong.id}/like`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Request failed");
      router.refresh();
    } catch {
      setLiked(!newLiked);
      updateLike(currentSong.id, !newLiked);
    }
  }

  function handlePlayToggle() {
    // ── FIX 1 + FIX 2b: prime on every user tap ─────────────────────────
    // primeAudioOnGesture() is idempotent — only does work on the first call.
    // This ensures the gesture token is locked in before we change any src.
    primeAudioOnGesture();
    setIsPlaying(!isPlaying);
  }

  // Also prime on skip buttons — they trigger playback too
  function handleNext() {
    primeAudioOnGesture();
    playNext();
  }

  function handlePrev() {
    primeAudioOnGesture();
    playPrev();
  }

  const currentTime = duration > 0 ? (progress / 100) * duration : 0;

  if (!mounted) return null;

  return (
    <>
      {currentSong && <div aria-hidden className="h-16" />}

      {/* ── Now-playing full-screen drawer (mobile only) ──────────────── */}
      <div
        className={`fixed inset-0 z-[55] flex flex-col overflow-hidden bg-gradient-to-b from-[#0d1a2b] to-[#04070d] sm:hidden transition-transform duration-300 ease-out ${
          showNowPlaying && currentSong
            ? "translate-y-0"
            : "translate-y-full pointer-events-none"
        }`}
      >
        <div className="flex flex-col items-center px-5 pt-3">
          <button
            onClick={() => setShowNowPlaying(false)}
            className="flex h-8 w-full items-center justify-center"
            aria-label="Close"
          >
            <div className="h-1 w-12 rounded-full bg-white/25" />
          </button>
          <div className="flex w-full items-center justify-between py-1">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
              Now Playing
            </p>
            <button
              onClick={() => setShowNowPlaying(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-white"
            >
              <ChevronDown size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 pb-8">
          <div className="mt-4 aspect-square w-full overflow-hidden rounded-2xl bg-slate-800 shadow-[0_24px_56px_rgba(0,0,0,0.7)]">
            {currentSong?.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentSong.thumbnail}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music size={64} className="text-slate-600" />
              </div>
            )}
          </div>

          <div className="mt-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[1.15rem] font-bold leading-snug text-white">
                {currentSong?.title ?? "—"}
              </p>
              <p className="mt-0.5 text-sm text-slate-400">
                {currentSong?.artist ?? ""}
              </p>
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
              onClick={handlePrev}
              className="flex h-12 w-12 items-center justify-center text-white"
            >
              <SkipBack size={30} />
            </button>
            <button
              onClick={handlePlayToggle}
              disabled={audioLoading}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform active:scale-95 disabled:opacity-60"
            >
              {audioLoading ? (
                <Loader2 size={22} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={26} />
              ) : (
                <Play size={26} className="ml-1" />
              )}
            </button>
            <button
              onClick={handleNext}
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

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                setShowNowPlaying(false);
                toggleQueue();
              }}
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
              onClick={() => {
                setShowNowPlaying(false);
                toggleVideo();
              }}
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

      {/* ── Floating video panel — draggable ─────────────────────────── */}
      <div
        ref={videoPanelRef}
        className="fixed z-50 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl"
        style={{
          width: Math.min(
            VIDEO_WIDTHS[videoSize],
            typeof window !== "undefined"
              ? window.innerWidth - 8
              : VIDEO_WIDTHS[videoSize]
          ),
          bottom:
            showVideo && currentSong
              ? panelPos.bottom
              : -(VIDEO_WIDTHS[videoSize] * 0.65 + 60),
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
        <div ref={containerRef} className="aspect-video w-full" />
      </div>

      {/* ── Queue panel ─────────────────────────────────────────────────── */}
      <div
        className={`fixed left-0 right-0 z-40 border-t border-white/8 bg-[#04070d]/97 backdrop-blur-2xl transition-all duration-300 ease-in-out ${
          showQueue && currentSong
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        style={{ bottom: 72 }}
      >
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Queue · {queue.filter((i) => songs[i]?.youtube_video_id).length}{" "}
              playable
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
              if (!s || !s.youtube_video_id) return null;
              const isCurrent = queueIdx === currentQueuePos;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    primeAudioOnGesture();
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
                      <img
                        src={s.thumbnail}
                        alt=""
                        className="h-full w-full object-cover"
                      />
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
                <p className="truncate text-[11px] text-slate-400 sm:text-xs">
                  {currentSong?.artist ?? ""}
                </p>
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
              onClick={handlePrev}
              title="Previous"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
            >
              <SkipBack size={18} />
            </button>
            <button
              onClick={handlePlayToggle}
              title={audioLoading ? "Loading…" : isPlaying ? "Pause" : "Play"}
              disabled={audioLoading}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 sm:h-10 sm:w-10 disabled:opacity-60"
            >
              {audioLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={17} />
              ) : (
                <Play size={17} className="ml-0.5" />
              )}
            </button>
            <button
              onClick={handleNext}
              title="Next"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
            >
              <SkipForward size={18} />
            </button>
            <button
              onClick={cycleRepeat}
              title={`Repeat: ${repeatMode}`}
              className={`hidden h-8 w-8 items-center justify-center rounded-lg transition-colors sm:flex ${
                repeatMode !== "off"
                  ? "text-cyan-400"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              {repeatMode === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

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
