"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore } from "@/store/player-store";

function formatTime(sec: number) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar() {
  const {
    currentSong,
    isPlaying,
    showVideo,
    isShuffle,
    repeatMode,
    playNext,
    playPrev,
    setIsPlaying,
    toggleShuffle,
    cycleRepeat,
    toggleVideo,
    updateLike,
  } = usePlayerStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playNextRef = useRef(playNext);
  playNextRef.current = playNext;

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [liked, setLiked] = useState(false);

  // ── YouTube IFrame API bootstrap ──────────────────────────────────────────
  const initPlayer = useCallback(() => {
    if (!containerRef.current || playerRef.current) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: "",
      playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onStateChange(event) {
          if (event.data === 1) {
            // PLAYING
            setIsPlaying(true);
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
            // PAUSED
            setIsPlaying(false);
          } else if (event.data === 0) {
            // ENDED
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

  // ── Load new video when currentSong changes ───────────────────────────────
  useEffect(() => {
    if (!currentSong?.youtube_video_id) return;
    setProgress(0);
    setDuration(0);
    setLiked(currentSong.liked);
    if (playerRef.current) {
      playerRef.current.loadVideoById(currentSong.youtube_video_id);
    }
  }, [currentSong?.youtube_video_id, currentSong?.id]);

  // Sync liked state when currentSong.liked changes (e.g. toggled on card)
  useEffect(() => {
    setLiked(currentSong?.liked ?? false);
  }, [currentSong?.liked]);

  // Sync play/pause from external Zustand changes
  useEffect(() => {
    if (!playerRef.current || !currentSong) return;
    try {
      if (isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    } catch {
      // Player may not be ready yet
    }
  }, [isPlaying, currentSong]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!playerRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    playerRef.current.seekTo(pct * duration, true);
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
    } catch {
      setLiked(!newLiked);
      updateLike(currentSong.id, !newLiked);
    }
  }

  const currentTime = duration > 0 ? (progress / 100) * duration : 0;

  return (
    <>
      {/* ── Floating video panel — always in DOM so audio is never interrupted ── */}
      <div
        className="fixed z-50 overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl transition-all duration-300 ease-in-out"
        style={{
          width: 340,
          // Slide in from bottom-right when visible
          bottom: showVideo && currentSong ? 88 : -400,
          right: 24,
          opacity: showVideo && currentSong ? 1 : 0,
          pointerEvents: showVideo && currentSong ? "auto" : "none",
        }}
      >
        <div ref={containerRef} className="aspect-video w-full" />
      </div>

      {/* ── Bottom player bar ─────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 border-t border-white/8 bg-[#04070d]/95 backdrop-blur-2xl transition-transform duration-300 ${
          currentSong ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Seekable progress bar */}
        <div
          className="h-1 w-full cursor-pointer bg-white/10 hover:h-1.5 transition-all"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          {/* Current song info */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-800">
              {currentSong?.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentSong.thumbnail}
                  alt={currentSong?.title ?? ""}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg">🎵</div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white leading-tight">
                {currentSong?.title ?? "—"}
              </p>
              <p className="truncate text-xs text-slate-400">{currentSong?.artist ?? ""}</p>
            </div>
            <button
              onClick={handleLike}
              className={`ml-1 shrink-0 text-base transition-all hover:scale-110 ${
                liked ? "text-rose-400" : "text-slate-600 hover:text-slate-300"
              }`}
            >
              {liked ? "❤️" : "🤍"}
            </button>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleShuffle}
              title="Shuffle"
              className={`h-8 w-8 rounded-lg text-sm transition-colors ${
                isShuffle ? "text-cyan-400" : "text-slate-500 hover:text-white"
              }`}
            >
              🔀
            </button>
            <button
              onClick={playPrev}
              title="Previous"
              className="h-9 w-9 rounded-xl text-white hover:bg-white/10"
            >
              ⏮
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "Pause" : "Play"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button
              onClick={playNext}
              title="Next"
              className="h-9 w-9 rounded-xl text-white hover:bg-white/10"
            >
              ⏭
            </button>
            <button
              onClick={cycleRepeat}
              title={`Repeat: ${repeatMode}`}
              className={`h-8 w-8 rounded-lg text-sm transition-colors ${
                repeatMode !== "off" ? "text-cyan-400" : "text-slate-500 hover:text-white"
              }`}
            >
              {repeatMode === "one" ? "🔂" : "🔁"}
            </button>
          </div>

          {/* Time + watch video button */}
          <div className="flex flex-1 items-center justify-end gap-3">
            <span className="hidden text-xs tabular-nums text-slate-500 sm:block">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <button
              onClick={toggleVideo}
              className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all ${
                showVideo
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/12 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {showVideo ? "🎵 Audio" : "📺 Video"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
