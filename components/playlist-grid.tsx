"use client";

import { useEffect } from "react";
import type { DbSong } from "@/lib/types";
import { usePlayerStore } from "@/store/player-store";
import { SongCard } from "@/components/song-card";

type PlaylistGridProps = {
  songs: DbSong[];
};

export function PlaylistGrid({ songs }: PlaylistGridProps) {
  const initPlaylist = usePlayerStore((s) => s.initPlaylist);

  useEffect(() => {
    initPlaylist(songs);
  }, [songs, initPlaylist]);

  if (songs.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No songs in this playlist yet. Try syncing again.
      </p>
    );
  }

  return (
    <div className="grid gap-1.5 sm:grid-cols-1">
      {songs.map((song, index) => (
        <SongCard key={song.id} song={song} index={index} />
      ))}
    </div>
  );
}
