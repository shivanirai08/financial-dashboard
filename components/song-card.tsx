"use client";

import { useState } from "react";
import type { DbSong } from "@/lib/types";
import { usePlayerStore } from "@/store/player-store";

type SongCardProps = {
  song: DbSong;
  index: number;
};

export function SongCard({ song, index }: SongCardProps) {
  const { currentSong, isPlaying, playAtIndex, toggleVideo, updateLike } = usePlayerStore();

  const isActive = currentSong?.id === song.id;
  const [liked, setLiked] = useState(song.liked);
  const [likeLoading, setLikeLoading] = useState(false);

  function handlePlay() {
    playAtIndex(index);
  }

  function handleWatchVideo(e: React.MouseEvent) {
    e.stopPropagation();
    playAtIndex(index);
    if (!isActive) {
      // Let the player load first, then show video
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
    <article
      onClick={handlePlay}
      className={`group relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] ${
        isActive
          ? "border-cyan-400/35 bg-cyan-400/[0.04]"
          : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      {/* Thumbnail */}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-800">
        {song.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={song.thumbnail}
            alt={song.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl opacity-40">
            🎵
          </div>
        )}
        {/* Active overlay */}
        {isActive && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
            <span className="text-white">{isPlaying ? "▶" : "⏸"}</span>
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
        {!song.youtube_video_id && (
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-rose-400/70">
            No match
          </p>
        )}
      </div>

      {/* Actions — visible on hover */}
      <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        {song.youtube_video_id && (
          <button
            onClick={handleWatchVideo}
            title="Watch video"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/6 text-sm text-white hover:bg-white/15"
          >
            📺
          </button>
        )}
        <button
          onClick={handleLike}
          title={liked ? "Unlike" : "Like"}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-all ${
            liked
              ? "border-rose-400/40 bg-rose-400/10 text-rose-400"
              : "border-white/12 bg-white/6 text-white hover:bg-white/15"
          }`}
        >
          {liked ? "❤️" : "🤍"}
        </button>
      </div>

      {/* Position number */}
      <span className="absolute right-3 top-3 text-[10px] text-slate-600 transition-opacity group-hover:opacity-0">
        {index + 1}
      </span>
    </article>
  );
}
