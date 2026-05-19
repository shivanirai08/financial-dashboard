import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistDetails,
  getPlaylistTracks,
} from "@/lib/spotify";
import { searchYoutubeVideos } from "@/lib/youtube";
import { createServerSupabase } from "@/lib/supabase";
import { slugify } from "@/lib/slug";

const SEARCH_TIMEOUT_MS = 8000;
const SEARCH_CONCURRENCY = 8;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(t);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const current = idx;
      idx += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function syncSpotifyPublicPlaylist(playlistInput: string) {
  console.log(`[syncSpotifyPublicPlaylist] Starting sync for: ${playlistInput}`);

  const playlistId = extractSpotifyPlaylistId(playlistInput);
  if (!playlistId) throw new Error("Invalid Spotify playlist URL or ID.");

  console.log(`[syncSpotifyPublicPlaylist] Extracted playlist ID: ${playlistId}`);

  const details = await fetchSpotifyPlaylistDetails(playlistId);
  console.log(`[syncSpotifyPublicPlaylist] Fetched playlist: ${details.name}`);

  const trackStrings = await getPlaylistTracks(playlistId);
  console.log(`[syncSpotifyPublicPlaylist] Fetched ${trackStrings.length} tracks`);

  const supabase = createServerSupabase();
  const slug = slugify(details.name) || playlistId;

  // Upsert playlist (create or update if same spotify_playlist_id)
  const { data: savedPlaylist, error: playlistError } = await supabase
    .from("playlists")
    .upsert(
      { spotify_playlist_id: playlistId, slug, name: details.name },
      { onConflict: "spotify_playlist_id" }
    )
    .select()
    .single();

  if (playlistError || !savedPlaylist) {
    throw new Error(`Failed to save playlist: ${playlistError?.message ?? "unknown"}`);
  }

  // Remove old songs so re-sync doesn't create duplicates
  await supabase.from("songs").delete().eq("playlist_id", savedPlaylist.id);

  // Search YouTube concurrently with bounded parallelism to stay under serverless timeouts.
  const songsToInsert = await mapWithConcurrency(trackStrings, SEARCH_CONCURRENCY, async (track, i) => {
    const parts = track.split(" - ").map((s) => s.trim());
    const title = parts[0] || "Unknown";
    const artist = parts[1] || "Unknown";

    let videoId: string | null = null;
    let videoUrl: string | null = null;
    let thumbnail: string | null = null;
    let duration: number | null = null;

    try {
      const results = await withTimeout(
        searchYoutubeVideos(`${title} ${artist} song`, 1),
        SEARCH_TIMEOUT_MS,
        `search for ${title}`
      );
      const first = results[0];
      if (first) {
        videoId = first.videoId;
        videoUrl = first.url;
        thumbnail = `https://img.youtube.com/vi/${first.videoId}/mqdefault.jpg`;
        duration = first.durationSeconds;
      }
    } catch (err) {
      console.warn(`[syncSpotifyPublicPlaylist] YouTube search failed for "${title}": ${String(err)}`);
    }

    return {
      playlist_id: savedPlaylist.id,
      title,
      artist,
      youtube_video_id: videoId,
      youtube_url: videoUrl,
      thumbnail,
      duration,
      position: i,
      liked: false,
    };
  });

  const { error: songsError } = await supabase.from("songs").insert(songsToInsert);
  if (songsError) throw new Error(`Failed to save songs: ${songsError.message}`);

  console.log(`[syncSpotifyPublicPlaylist] Successfully synced: ${savedPlaylist.slug}`);
  return { slug: savedPlaylist.slug };
}
