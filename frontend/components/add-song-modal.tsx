"use client";

import { useState } from "react";
import { Search, X, Loader2, Music, Plus } from "lucide-react";
import type { DbSong } from "@/lib/types";
import { usePlayerStore } from "@/store/player-store";
import { useToastStore } from "@/store/toast-store";
import { useRouter } from "next/navigation";

type YtResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  url: string;
  durationSeconds: number | null;
};

type Props = {
  playlistId: string;
  onClose: () => void;
};

function formatDuration(seconds: number | null) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AddSongModal({ playlistId, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YtResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const addSong = usePlayerStore((s) => s.addSong);
  const addToast = useToastStore((s) => s.addToast);
  const router = useRouter();

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

  async function handleAdd(result: YtResult) {
    setAdding(result.videoId);
    try {
      const thumbnail = `https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`;
      const res = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          artist: result.artist,
          youtube_video_id: result.videoId,
          youtube_url: result.url,
          thumbnail,
          duration: result.durationSeconds,
        }),
      });
      if (!res.ok) throw new Error("Failed to add");
      const data = await res.json();
      addSong(data.song as DbSong);
      addToast(`Added "${result.title}"`, "success");
      router.refresh();
      setResults((prev) => prev.filter((r) => r.videoId !== result.videoId));
    } catch {
      addToast("Failed to add song", "error");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1825] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <p className="text-sm font-semibold text-white">Add Song</p>
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
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
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
                <div
                  key={result.videoId}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3"
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
                  <button
                    onClick={() => handleAdd(result)}
                    disabled={adding !== null}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 transition-all hover:bg-cyan-500/30 disabled:opacity-40"
                  >
                    {adding === result.videoId ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">
              Search YouTube to find a song to add
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
