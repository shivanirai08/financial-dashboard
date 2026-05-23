"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, Plus, Check, X, Loader2 } from "lucide-react";
import type { DbPlaylist, DbSong } from "@/lib/types";
import { useToastStore } from "@/store/toast-store";
import { AddSongModal } from "./add-song-modal";

type Props = {
  playlist: DbPlaylist;
  songs: DbSong[];
};

export function PlaylistHeader({ playlist, songs }: Props) {
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);

  const matchedCount = songs.filter((s) => s.youtube_video_id).length;

  // Rename state
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(playlist.name);
  const [renaming, setRenaming] = useState(false);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add song modal
  const [showAddSong, setShowAddSong] = useState(false);

  async function handleRename() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === playlist.name) {
      setEditing(false);
      setNameInput(playlist.name);
      return;
    }
    setRenaming(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error("Rename failed");
      addToast("Playlist renamed", "success");
      router.refresh();
    } catch {
      addToast("Failed to rename playlist", "error");
      setNameInput(playlist.name);
    } finally {
      setRenaming(false);
      setEditing(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      addToast("Playlist deleted", "success");
      router.push("/");
    } catch {
      addToast("Failed to delete playlist", "error");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-3 backdrop-blur-xl sm:rounded-[2rem] sm:p-7">
        {/* Back + actions row */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-1.5 sm:mb-4 sm:gap-2">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-all hover:bg-white/10 hover:text-white sm:px-3 sm:py-2 sm:text-sm"
          >
            <ArrowLeft size={15} />
            Back
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {!confirmDelete ? (
              <>
                <button
                  onClick={() => setShowAddSong(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 px-2.5 py-1.5 text-xs text-cyan-300 transition-all hover:bg-cyan-400/15 sm:px-3 sm:py-2 sm:text-sm"
                >
                  <Plus size={14} />
                  <span className="sm:hidden">Add</span>
                  <span className="hidden sm:inline">Add song</span>
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-rose-400/30 hover:bg-rose-400/8 hover:text-rose-400 sm:h-9 sm:w-9"
                  title="Delete playlist"
                >
                  <Trash2 size={15} />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-400/8 px-2.5 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
                <span className="text-xs text-rose-300 sm:text-sm">Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500 text-white transition-opacity hover:bg-rose-400 disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-slate-300 transition-colors hover:bg-white/15"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Playlist kicker */}
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 sm:text-xs sm:tracking-[0.24em]">Playlist</p>

        {/* Editable name */}
        {editing ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setNameInput(playlist.name);
                }
              }}
              autoFocus
              className="flex-1 rounded-xl border border-cyan-400/40 bg-white/5 px-3 py-2 text-base font-bold text-white outline-none sm:text-2xl"
            />
            <button
              onClick={handleRename}
              disabled={renaming}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white disabled:opacity-50 sm:h-10 sm:w-10"
            >
              {renaming ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setNameInput(playlist.name);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 text-slate-400 hover:text-white sm:h-10 sm:w-10"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="mt-2 flex items-start gap-3">
            <h1 className="flex-1 truncate text-lg font-bold tracking-tight text-white sm:text-3xl">
              {playlist.name}
            </h1>
            <button
              onClick={() => setEditing(true)}
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/8 hover:text-white sm:mt-1 sm:h-8 sm:w-8"
              title="Rename playlist"
            >
              <Pencil size={15} />
            </button>
          </div>
        )}

        {/* Meta info */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 sm:mt-4 sm:gap-4 sm:text-sm">
          <span>{songs.length} songs</span>
          <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-flex" />
          <span>{matchedCount} matched on YouTube</span>
          <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-flex" />
          <span>{new Date(playlist.created_at).toLocaleDateString()}</span>
        </div>

        <p className="mt-2 text-[11px] text-slate-500 sm:mt-3 sm:text-xs">
          Click any song to play. Use the bar at the bottom to control playback.
        </p>
      </section>

      {showAddSong && (
        <AddSongModal
          playlistId={playlist.id}
          onClose={() => setShowAddSong(false)}
        />
      )}
    </>
  );
}
