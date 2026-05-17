"use client";

import { useState } from "react";
import { Play, Pause, Heart, Video, Music, Search, AlertCircle } from "lucide-react";
import type { DbSong } from "@/lib/types";
import { usePlayerStore } from "@/store/player-store";
import { FixSongModal } from "./fix-song-modal";

type SongCardProps = {
  song: DbSong;
  index: number;
};

export function SongCard({ song, index }: SongCardProps) {
  const { currentSong, isPlaying, playAtIndex, toggleVideo, updateLike } = usePlayerStore();

  const isActive = currentSong?.id === song.id;
  const [liked, setLiked] = useState(song.liked ?? false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);

  // We read the video id from the store so it updates immediately after a fix
  const storeVideo = usePlayerStore(
    (s) => s.songs.find((s2) => s2.id === song.id)?.youtube_video_id ?? song.youtube_video_id
  );
  const hasVideo = Boolean(storeVideo);

  function handlePlay() {
    if (hasVideo) playAtIndex(index);
  }

  function handleWatchVideo(e: React.MouseEvent) {
    e.stopPropagation();
    playAtIndex(index);
    if (!isActive) {
      setTimeout(() => toggleVideo(), 100);
    } else {
      toggleVideo();
    }
  }

  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation();
    if (likeLoading) return;
    const newLiked = !liked;
    setLiked(newLiked);
    updateLike(song.id, newLiked);
    setLikeLoading(true);
    try {
      const res = await fetch(`/api/songs/${song.id}/like`, { method: "PATCH" });
      if (!res.ok) throw new Error("Request failed");
    } catch {
      setLiked(!newLiked);
      updateLike(song.id, !newLiked);
    } finally {
      setLikeLoading(false);
    }
  }

  return (
    <>
      <article
        onClick={handlePlay}
        className={`group relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] ${
          isActive
            ? "border-cyan-400/35 bg-cyan-400/[0.04]"
            : "border-white/[0.07] bg-white/[0.02]"
        } ${!hasVideo ? "cursor-default" : ""}`}
      >
        {/* Thumbnail / Placeholder */}
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-800">
          {song.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={song.thumbnail}
              alt={song.title ?? ""}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-600">
              <Music size={22} />
            </div>
          )}
          {/* Active play / pause overlay */}
          {isActive && hasVideo && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55">
              {isPlaying ? (
                <Pause size={20} className="text-white" />
              ) : (
                <Play size={20} className="text-white" />
              )}
            </div>
          )}
          {/* Hover play overlay (only when not active and has video) */}
          {!isActive && hasVideo && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Play size={18} className="text-white" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-semibold leading-snug ${
              isActive ? "text-cyan-300" : "text-white"
            }`}
          >
            {song.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{song.artist}</p>

          {/* No match badge — always visible, not hover-gated */}
          {!hasVideo && (
            <div className="mt-1 flex items-center gap-1">
              <AlertCircle size={10} className="text-rose-400/70" />
              <span className="text-[10px] font-medium uppercase tracking-wide text-rose-400/70">
                No match
              </span>
            </div>
          )}
        </div>

        {/* Right-side actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Fix button — always visible when no video */}
          {!hasVideo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFixModal(true);
              }}
              title="Find on YouTube"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-400/25 bg-rose-400/8 text-rose-400 transition-all hover:bg-rose-400/15"
            >
              <Search size={14} />
            </button>
          )}

          {/* Hover-only actions */}
          <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            {hasVideo && (
              <button
                onClick={handleWatchVideo}
                title="Watch video"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-all hover:bg-white/12 hover:text-white"
              >
                <Video size={14} />
              </button>
            )}
            <button
              onClick={handleLike}
              title={liked ? "Unlike" : "Like"}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                liked
                  ? "border-rose-400/40 bg-rose-400/10 text-rose-400"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/12 hover:text-white"
              }`}
            >
              <Heart size={14} className={liked ? "fill-rose-400" : ""} />
            </button>
          </div>

          {/* Position number — fades out on hover */}
          <span className="ml-1 min-w-[1.5rem] text-right text-[10px] tabular-nums text-slate-600 transition-opacity group-hover:opacity-0">
            {index + 1}
          </span>
        </div>
      </article>

      {/* Fix modal — portal-like, rendered outside article */}
      {showFixModal && (
        <FixSongModal song={song} onClose={() => setShowFixModal(false)} />
      )}
    </>
  );
}
