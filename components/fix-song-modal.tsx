"use client";

import { useState } from "react";
import { Search, X, Check, Loader2, Music } from "lucide-react";
import type { DbSong } from "@/lib/types";
import { usePlayerStore } from "@/store/player-store";
import { useToastStore } from "@/store/toast-store";

type YtResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  url: string;
  durationSeconds: number | null;
};

type Props = {
  song: DbSong;
  onClose: () => void;
};

function formatDuration(seconds: number | null) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FixSongModal({ song, onClose }: Props) {
  const [query, setQuery] = useState(`${song.title ?? ""} ${song.artist ?? ""}`.trim());
  const [results, setResults] = useState<YtResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const updateSongVideoId = usePlayerStore((s) => s.updateSongVideoId);
  const addToast = useToastStore((s) => s.addToast);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}&limit=10`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.collection ?? []);
    } catch {
      addToast("Search failed. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(result: YtResult) {
    setSaving(result.videoId);
    try {
      const thumbnail = `https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`;
      const res = await fetch(`/api/songs/${song.id}/fix`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtube_video_id: result.videoId,
          youtube_url: result.url,
          thumbnail,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      updateSongVideoId(song.id, result.videoId, result.url, thumbnail);
      addToast("Song linked to YouTube", "success");
      onClose();
    } catch {
      addToast("Failed to save. Please try again.", "error");
      setSaving(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1825] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/8 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-white">Link to YouTube</p>
            <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400">
              {song.title}
              {song.artist ? ` — ${song.artist}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 pt-4">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500/50 focus:bg-white/8"
              placeholder="Search YouTube..."
              autoFocus
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white transition-opacity disabled:opacity-40 hover:bg-cyan-400"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="mt-3 max-h-80 overflow-y-auto px-5 pb-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[60px] animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-2">
              {results.map((result) => (
                <button
                  key={result.videoId}
                  onClick={() => handleSelect(result)}
                  disabled={saving !== null}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 text-left transition-all hover:border-white/15 hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-50"
                >
                  {result.thumbnailUrl ? (
                    <img
                      src={result.thumbnailUrl}
                      alt=""
                      className="h-10 w-[68px] shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-[68px] shrink-0 items-center justify-center rounded-lg bg-slate-800">
                      <Music size={14} className="text-slate-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{result.title}</p>
                    <p className="truncate text-xs text-slate-400">{result.artist}</p>
                  </div>
                  {result.durationSeconds ? (
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      {formatDuration(result.durationSeconds)}
                    </span>
                  ) : null}
                  {saving === result.videoId ? (
                    <Loader2 size={14} className="shrink-0 animate-spin text-cyan-400" />
                  ) : (
                    <Check size={14} className="shrink-0 text-slate-600" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">
              Search YouTube to find the right video
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
