"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Heart, Video, Music, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { DbSong } from "@/lib/types";
import { usePlayerStore } from "@/store/player-store";
import { FixSongModal } from "./fix-song-modal";
import { useToastStore } from "@/store/toast-store";

type SongCardProps = {
  song: DbSong;
  index: number;
};

export function SongCard({ song, index }: SongCardProps) {
  const router = useRouter();
  const { currentSong, isPlaying, playAtIndex, toggleVideo, updateLike, removeSong } =
    usePlayerStore();

  const isActive = currentSong?.id === song.id;
  const [liked, setLiked] = useState(song.liked ?? false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const addToast = useToastStore((s) => s.addToast);

  // We read the video id from the store so it updates immediately after a fix
  const storeVideo = usePlayerStore(
    (s) => s.songs.find((s2) => s2.id === song.id)?.youtube_video_id ?? song.youtube_video_id
  );
  const hasVideo = Boolean(storeVideo);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

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
      // Refresh server data so Favs count on home page + /favs list stay in sync
      router.refresh();
    } catch {
      setLiked(!newLiked);
      updateLike(song.id, !newLiked);
    } finally {
      setLikeLoading(false);
    }
  }

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    setRemoving(true);
    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      removeSong(song.id);
      // Refresh the server component so counts update
      router.refresh();
      addToast("Song removed", "success");
    } catch {
      addToast("Failed to remove song", "error");
      setRemoving(false);
    }
  }

  return (
    <>
      <article
        onClick={handlePlay}
        className={`group relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] ${
          isActive
            ? "border-cyan-400/35 bg-cyan-400/[0.04]"
            : removing
            ? "border-rose-500/20 bg-rose-500/5 opacity-50"
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
          {isActive && hasVideo && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55">
              {isPlaying ? (
                <Pause size={20} className="text-white" />
              ) : (
                <Play size={20} className="text-white" />
              )}
            </div>
          )}
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
          {!hasVideo && (
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-rose-400/70">
              No YouTube match
            </p>
          )}
        </div>

        {/* Right-side actions */}
        <div className="flex shrink-0 items-center gap-1">
          {/* On mobile always show; on desktop show on hover */}
          <div className="flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
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

          {/* 3-dot menu — always visible */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              title="More options"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-white/8 hover:text-white"
            >
              <MoreVertical size={15} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div
                className="absolute right-0 top-9 z-30 min-w-[180px] overflow-hidden rounded-xl border border-white/12 bg-[#0d1825] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setShowFixModal(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-white/8"
                >
                  <Pencil size={14} className="text-slate-400" />
                  Change YouTube match
                </button>
                <div className="mx-3 my-0.5 border-t border-white/8" />
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-rose-400 transition-colors hover:bg-rose-400/8 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Remove from playlist
                </button>
              </div>
            )}
          </div>
        </div>
      </article>

      {showFixModal && (
        <FixSongModal song={song} onClose={() => setShowFixModal(false)} />
      )}
    </>
  );
}
