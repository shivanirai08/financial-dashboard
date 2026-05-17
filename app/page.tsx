import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase";
import { searchYoutubeVideos } from "@/lib/youtube";
import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistDetails,
  getPlaylistTracks,
} from "@/lib/spotify";
import type { DbPlaylist } from "@/lib/types";

type HomePageProps = {
  searchParams: Promise<{
    q?: string;
    error?: string;
    details?: string;
    playlist?: string;
  }>;
};

async function getPlaylistPreview(playlistInput: string): Promise<{
  data: { name: string; songs: string[] } | null;
  error: string | null;
}> {
  if (!playlistInput) {
    return { data: null, error: null };
  }

  const playlistId = extractSpotifyPlaylistId(playlistInput);

  if (!playlistId) {
    return { data: null, error: "Invalid Spotify playlist URL or playlist ID." };
  }

  try {
    const playlist = await fetchSpotifyPlaylistDetails(playlistId);
    const songs = await getPlaylistTracks(playlistId);

    return {
      data: {
        name: playlist.name,
        songs,
      },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch playlist details.";
    return { data: null, error: message };
  }
}

function getErrorMessage(error: string | undefined) {
  switch (error) {
    case "connect-spotify":
      return "Connect Spotify first for account sync.";
    case "spotify-auth":
      return "Spotify auth failed. Try connecting again.";
    case "missing-spotify-playlist":
      return "Enter a Spotify playlist URL or playlist ID.";
    case "spotify-public-sync-failed":
      return "Could not sync that public playlist. Check URL/ID and try again.";
    default:
      return null;
  }
}

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = await searchParams;
  const searchQuery = resolvedSearchParams.q?.trim() ?? "";
  const playlistInput = resolvedSearchParams.playlist?.trim() ?? "";
  const errorMessage = getErrorMessage(resolvedSearchParams.error);
  const [playlists, searchResults, playlistPreview] = await Promise.all([
    (async () => {
      try {
        const supabase = createServerSupabase();
        const { data } = await supabase
          .from("playlists")
          .select("id, name, slug, created_at")
          .order("created_at", { ascending: false })
          .limit(12);
        return (data ?? []) as Pick<DbPlaylist, "id" | "name" | "slug" | "created_at">[];
      } catch {
        return [];
      }
    })(),
    searchQuery ? searchYoutubeVideos(searchQuery, 8) : Promise.resolve([]),
    getPlaylistPreview(playlistInput),
  ]);
  const firstSearchResult = searchResults[0] ?? null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#07111f_0%,_#04070d_100%)] px-6 py-10 text-white sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="panel">
          <p className="panel-kicker">Spotify + YouTube</p>
          <h1 className="panel-title">Import Spotify playlist and match on YouTube</h1>
          <p className="panel-copy">
            Paste any public Spotify playlist URL (or playlist ID). Each track is
            searched on YouTube and the first video is saved as the match.
          </p>

          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <form action="/api/sync/public" method="post" className="flex flex-1 gap-3">
              <input
                type="text"
                name="playlist"
                defaultValue={playlistInput}
                required
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base text-white outline-none placeholder:text-slate-400 focus:border-cyan-300"
                placeholder="https://open.spotify.com/playlist/..."
              />
              <button className="primary-button" type="submit">
                Sync Public Playlist
              </button>
            </form>
          </div>

          <form action="/" method="get" className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              name="playlist"
              defaultValue={playlistInput}
              className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base text-white outline-none placeholder:text-slate-400 focus:border-cyan-300"
              placeholder="Paste playlist URL/ID to preview songs"
            />
            <button className="secondary-button" type="submit">
              Preview Playlist
            </button>
          </form>

          {playlistPreview.error ? (
            <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {playlistPreview.error}
            </p>
          ) : null}

          {playlistPreview.data ? (
            <article className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Playlist Preview</p>
              <h3 className="mt-2 text-lg font-semibold text-white">{playlistPreview.data.name}</h3>
              <p className="mt-1 text-sm text-slate-300">
                This playlist has {playlistPreview.data.songs.length} songs.
              </p>
              <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-white/10 bg-slate-950/50 p-3">
                <ol className="space-y-2 text-sm text-slate-200">
                  {playlistPreview.data.songs.map((song, index) => (
                    <li key={`${song}-${index}`}>
                      <span className="text-slate-400">{index + 1}.</span> {song}
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ) : null}

          <div className="mt-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <form action="/api/spotify/login" method="get">
                <button className="secondary-button" type="submit">
                  Connect Spotify Account
                </button>
              </form>
              <form action="/api/sync" method="post">
                <button className="secondary-button" type="submit">
                  Sync My Spotify Library
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="panel">
          <p className="panel-kicker">Direct Search</p>
          <h2 className="panel-title">Search on YouTube and play immediately</h2>
          <p className="panel-copy">
            Enter a song name. We fetch results via the server endpoint and embed
            the top match for instant playback.
          </p>

          <form action="/" method="get" className="mt-5 flex gap-3">
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base text-white outline-none placeholder:text-slate-400 focus:border-cyan-300"
              placeholder="Song name, artist"
            />
            <button className="secondary-button" type="submit">
              Search
            </button>
          </form>

          {searchQuery ? (
            <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-3">
                {firstSearchResult ? (
                  <iframe
                    className="aspect-video w-full rounded-xl border border-white/10"
                    src={`https://www.youtube.com/embed/${firstSearchResult.videoId}`}
                    title={firstSearchResult.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-slate-400">
                    No results found.
                  </div>
                )}
              </div>
              <div className="grid gap-3">
                {searchResults.map((item) => (
                  <article
                    key={item.videoId}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.artist}</p>
                    <a
                      href={`/?q=${encodeURIComponent(`${item.title} ${item.artist}`)}`}
                      className="mt-3 inline-flex text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300"
                    >
                      Play this
                    </a>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <p className="panel-kicker">Synced Playlists</p>
          <h2 className="panel-title">Recently synced</h2>
          <div className="mt-4 grid gap-3">
            {playlists.length === 0 ? (
              <p className="text-sm text-slate-400">No playlists synced yet.</p>
            ) : (
              playlists.map((playlist) => (
                <Link
                  key={playlist.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white hover:border-cyan-300/40"
                  href={`/playlist/${playlist.slug}`}
                >
                  {playlist.name}
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
