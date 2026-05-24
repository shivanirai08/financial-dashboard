import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistDetails,
  getPlaylistTracks,
} from "@/lib/spotify";
import { searchYoutubeVideos } from "@/lib/youtube";
import { createServerSupabase } from "@/lib/supabase";
import { slugify } from "@/lib/slug";

export async function syncSpotifyPublicPlaylist(playlistInput: string) {
  console.log(`[syncSpotifyPublicPlaylist] Starting sync for: `);
  const startedAt = Date.now();

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

  // Keep matching within the hobby-plan runtime budget; save the rest without
  // YouTube IDs instead of timing out the entire playlist import.
  const MAX_CONCURRENT = 8;
  const MATCH_BUDGET_MS = 240_000;
  const songsToInsert = [];
  let skippedLookupCount = 0;

  for (let i = 0; i < trackStrings.length; i += MAX_CONCURRENT) {
    const batch = trackStrings.slice(i, i + MAX_CONCURRENT);
    const shouldSkipLookup = Date.now() - startedAt >= MATCH_BUDGET_MS;

    const results = shouldSkipLookup
      ? batch.map((trackString, batchIndex) => {
          const globalIndex = i + batchIndex;
          const parts = trackString.split(" - ").map((s) => s.trim());
          const title = parts[0] || "Unknown";
          const artist = parts[1] || "Unknown";
          skippedLookupCount += 1;

          return {
            playlist_id: savedPlaylist.id,
            title,
            artist,
            youtube_video_id: null,
            youtube_url: null,
            thumbnail: null,
            duration: null,
            position: globalIndex,
            liked: false,
          };
        })
      : await Promise.all(
          batch.map(async (trackString, batchIndex) => {
            const globalIndex = i + batchIndex;
            const parts = trackString.split(" - ").map((s) => s.trim());
            const title = parts[0] || "Unknown";
            const artist = parts[1] || "Unknown";

            let videoId: string | null = null;
            let videoUrl: string | null = null;
            let thumbnail: string | null = null;
            let duration: number | null = null;

            try {
              const searchResults = await searchYoutubeVideos(`${title} ${artist} song`, 1);
              const first = searchResults[0];
              if (first) {
                videoId = first.videoId;
                videoUrl = first.url;
                thumbnail = `https://img.youtube.com/vi/${first.videoId}/mqdefault.jpg`;
                duration = first.durationSeconds;
              }
            } catch (err) {
              console.warn(`[syncSpotifyPublicPlaylist] YouTube search failed for "${title}": ${err}`);
            }

            return {
              playlist_id: savedPlaylist.id,
              title,
              artist,
              youtube_video_id: videoId,
              youtube_url: videoUrl,
              thumbnail,
              duration,
              position: globalIndex,
              liked: false,
            };
          })
        );

    songsToInsert.push(...results);
  }

  const { error: songsError } = await supabase.from("songs").insert(songsToInsert);
  if (songsError) throw new Error(`Failed to save songs: ${songsError.message}`);

  if (skippedLookupCount > 0) {
    console.warn(
      `[syncSpotifyPublicPlaylist] Saved ${skippedLookupCount} songs without YouTube matches to stay within runtime budget`
    );
  }

  console.log(`[syncSpotifyPublicPlaylist] Successfully synced: ${savedPlaylist.slug}`);
  return { slug: savedPlaylist.slug };
}
