"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
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
            setIsPlaying(false);
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

  // ── Load new video when currentSong changes ───────────────────────────────
  useEffect(() => {
    if (!currentSong?.youtube_video_id) return;
    setProgress(0);
    setDuration(0);
    setLiked(currentSong.liked ?? false);
    if (playerRef.current) {
      playerRef.current.loadVideoById(currentSong.youtube_video_id);
    }
  }, [currentSong?.youtube_video_id, currentSong?.id]);

  useEffect(() => {
    setLiked(currentSong?.liked ?? false);
  }, [currentSong?.liked]);

  useEffect(() => {
    if (!playerRef.current || !currentSong) return;
    try {
      if (isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    } catch {
      // player may not be ready yet
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
      {/* ── Hidden YT player — always in DOM so audio never interrupts ─── */}
      <div
        className="fixed z-50 overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl transition-all duration-300 ease-in-out"
        style={{
          width: 340,
          bottom: showVideo && currentSong ? 88 : -400,
          right: 24,
          opacity: showVideo && currentSong ? 1 : 0,
          pointerEvents: showVideo && currentSong ? "auto" : "none",
        }}
      >
        <div ref={containerRef} className="aspect-video w-full" />
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
              Queue · {queue.length} songs
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
              if (!s) return null;
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

        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
          {/* Song info + like */}
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
                <div className="flex h-full w-full items-center justify-center">
                  <Music size={16} className="text-slate-600" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {currentSong?.title ?? "—"}
              </p>
              <p className="truncate text-xs text-slate-400">{currentSong?.artist ?? ""}</p>
            </div>
            <button
              onClick={handleLike}
              title={liked ? "Unlike" : "Like"}
              className={`ml-1 shrink-0 transition-all hover:scale-110 ${
                liked ? "text-rose-400" : "text-slate-600 hover:text-slate-300"
              }`}
            >
              <Heart size={16} className={liked ? "fill-rose-400" : ""} />
            </button>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleShuffle}
              title="Shuffle"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
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
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "Pause" : "Play"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
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
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                repeatMode !== "off" ? "text-cyan-400" : "text-slate-500 hover:text-white"
              }`}
            >
              {repeatMode === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

          {/* Right controls */}
          <div className="flex flex-1 items-center justify-end gap-2">
            <span className="hidden text-xs tabular-nums text-slate-500 sm:block">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
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
