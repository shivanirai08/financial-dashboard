"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Music, Plus, X, Loader2 } from "lucide-react";

type SongPreview = { name: string; artist: string };
type PreviewData = { playlistName: string; totalSongs: number; songs: SongPreview[] };
type YtItem = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  url: string;
};
type SavedPlaylist = { id: string; name: string; slug: string; created_at: string };

type Props = {
  playlists: SavedPlaylist[];
};

export function HomeClient({ playlists }: Props) {
  const router = useRouter();

  // ── Spotify section ──────────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── YouTube direct search ────────────────────────────────────────────────
  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<YtItem[]>([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  // ── Create playlist ──────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handlePreview() {
    const val = input.trim();
    if (!val) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const res = await fetch(
        `/api/spotify/public-names?playlist=${encodeURIComponent(val)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch playlist details.");
      setPreview({
        playlistName: data.playlist?.name ?? "Unknown Playlist",
        totalSongs: data.totalSongs ?? data.songs?.length ?? 0,
        songs: data.songs ?? [],
      });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSync() {
    const val = input.trim();
    if (!val) return;
    setSyncLoading(true);
    setSyncError(null);
    try {
      const body = new FormData();
      body.set("playlist", val);
      const res = await fetch("/api/sync/public", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      router.push(`/playlist/${data.slug}`);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Unknown error");
      setSyncLoading(false);
    }
  }

  async function handleYtSearch() {
    const val = ytQuery.trim();
    if (!val) return;
    setYtLoading(true);
    setYtResults([]);
    setActiveVideoId(null);
    try {
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(val)}&limit=8`
      );
      const data = await res.json();
      const items: YtItem[] = data.collection ?? [];
      setYtResults(items);
      setActiveVideoId(items[0]?.videoId ?? null);
    } catch {
      setYtResults([]);
    } finally {
      setYtLoading(false);
    }
  }

  async function handleCreatePlaylist() {
    const name = newPlaylistName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      router.push(`/playlist/${data.playlist.slug}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Unknown error");
      setCreating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#07111f_0%,_#04070d_100%)] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">

        {/* ── Header ── */}
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Pulsebox</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Your Spotify playlists,<br className="hidden sm:block" /> on YouTube
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            Paste any public Spotify playlist URL. We match every track to a YouTube video
            so you can play it straight from the browser.
          </p>
        </header>

        {/* ── Spotify Import ── */}
        <section className="panel">
          <p className="panel-kicker">Spotify Playlist</p>
          <h2 className="panel-title">Import &amp; sync a playlist</h2>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handlePreview(); }}
              disabled={previewLoading || syncLoading}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60 disabled:opacity-50"
              placeholder="https://open.spotify.com/playlist/..."
            />
            <div className="flex shrink-0 gap-2">
              <button
                onClick={handlePreview}
                disabled={previewLoading || !input.trim()}
                className="secondary-button disabled:cursor-not-allowed disabled:opacity-40"
              >
                {previewLoading ? (
                  <span className="flex items-center gap-2">
                    <Spinner /> Fetching…
                  </span>
                ) : "Preview"}
              </button>
              <button
                onClick={handleSync}
                disabled={syncLoading || !input.trim()}
                className="primary-button disabled:cursor-not-allowed disabled:opacity-40"
              >
                {syncLoading ? (
                  <span className="flex items-center gap-2">
                    <Spinner /> Syncing…
                  </span>
                ) : "Sync"}
              </button>
            </div>
          </div>

          {/* Sync loading detail */}
          {syncLoading && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">
              <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
              <div>
                <p className="font-semibold">Syncing playlist — please wait</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  We are searching YouTube for each track. This takes about 1–6 minutes
                  depending on the number of songs. Don&apos;t close this tab.
                </p>
              </div>
            </div>
          )}

          {previewError && (
            <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-400/8 px-4 py-3 text-sm text-amber-200">
              {previewError}
            </p>
          )}

          {syncError && (
            <p className="mt-3 rounded-xl border border-rose-300/25 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">
              {syncError}
            </p>
          )}

          {/* Playlist Preview Card */}
          {preview && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-400">Preview</p>
                  <p className="mt-1 text-base font-semibold text-white">{preview.playlistName}</p>
                  <p className="mt-0.5 text-sm text-slate-400">
                    {preview.totalSongs} songs · Click <strong className="text-white">Sync</strong> to match all tracks to YouTube
                  </p>
                </div>
              </div>
              <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-white/8 bg-slate-950/50 p-3">
                <ol className="space-y-1.5 text-sm">
                  {preview.songs.map((song, i) => (
                    <li key={`${i}-${song.name}`} className="flex items-baseline gap-2">
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">{i + 1}.</span>
                      <span className="text-white">{song.name}</span>
                      <span className="text-slate-400">— {song.artist}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </section>

        {/* ── YouTube Direct Search ── */}
        <section className="panel">
          <p className="panel-kicker">Quick Search</p>
          <h2 className="panel-title">Search YouTube directly</h2>
          <p className="mt-1 text-sm text-slate-400">
            Find and play any song immediately without syncing a full playlist.
          </p>

          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={ytQuery}
              onChange={(e) => setYtQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleYtSearch(); }}
              disabled={ytLoading}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60 disabled:opacity-50"
              placeholder="Song name, artist…"
            />
            <button
              onClick={handleYtSearch}
              disabled={ytLoading || !ytQuery.trim()}
              className="secondary-button shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ytLoading ? <Spinner /> : "Search"}
            </button>
          </div>

          {ytResults.length > 0 && (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                <iframe
                  key={activeVideoId}
                  className="aspect-video w-full"
                  src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1`}
                  title="YouTube player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="flex flex-col gap-2 overflow-y-auto lg:max-h-[312px]">
                {ytResults.map((item) => (
                  <button
                    key={item.videoId}
                    onClick={() => setActiveVideoId(item.videoId)}
                    className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                      activeVideoId === item.videoId
                        ? "border-cyan-400/35 bg-cyan-400/8"
                        : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/5"
                    }`}
                  >
                    {item.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="h-10 w-16 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">{item.title}</p>
                      <p className="truncate text-[11px] text-slate-400">{item.artist}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Library ── */}
        <section className="panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="panel-kicker">Library</p>
              <h2 className="panel-title">Playlists</h2>
            </div>
            <button
              onClick={() => { setShowCreateModal(true); setNewPlaylistName(""); setCreateError(null); }}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 px-3 py-2 text-sm text-cyan-300 transition-all hover:bg-cyan-400/15"
            >
              <Plus size={14} />
              New playlist
            </button>
          </div>
          {playlists.length > 0 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {playlists.map((pl) => (
                <Link
                  key={pl.id}
                  href={`/playlist/${pl.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm text-white transition-all hover:border-cyan-400/30 hover:bg-white/[0.05]"
                >
                  <Music size={16} className="shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{pl.name}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(pl.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No playlists yet. Import a Spotify playlist or create one manually.
            </p>
          )}
        </section>

        {/* ── Create playlist modal ── */}
        {showCreateModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
            <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1825] p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">New Playlist</p>
                <button onClick={() => setShowCreateModal(false)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-white">
                  <X size={15} />
                </button>
              </div>
              <input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreatePlaylist()}
                autoFocus
                placeholder="Playlist name"
                className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500/50"
              />
              {createError && (
                <p className="mt-2 text-xs text-rose-400">{createError}</p>
              )}
              <button
                onClick={handleCreatePlaylist}
                disabled={creating || !newPlaylistName.trim()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-cyan-400"
              >
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Create
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Spinner() {
  return <Loader2 className="h-4 w-4 animate-spin" />;
}
