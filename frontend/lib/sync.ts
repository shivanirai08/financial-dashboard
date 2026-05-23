import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistDetails,
  getPlaylistTracks,
} from "@/lib/spotify";
import { searchYoutubeVideos } from "@/lib/youtube";
import { createServerSupabase } from "@/lib/supabase";
import { slugify } from "@/lib/slug";

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

  // Search YouTube for each track; failures are per-song so one bad search doesn't abort all
  const songsToInsert = [];
  for (let i = 0; i < trackStrings.length; i++) {
    const parts = trackStrings[i].split(" - ").map((s) => s.trim());
    const title = parts[0] || "Unknown";
    const artist = parts[1] || "Unknown";

    let videoId: string | null = null;
    let videoUrl: string | null = null;
    let thumbnail: string | null = null;
    let duration: number | null = null;

    try {
      const results = await searchYoutubeVideos(`${title} ${artist} song`, 1);
      const first = results[0];
      if (first) {
        videoId = first.videoId;
        videoUrl = first.url;
        thumbnail = `https://img.youtube.com/vi/${first.videoId}/mqdefault.jpg`;
        duration = first.durationSeconds;
      }
    } catch (err) {
      console.warn(`[syncSpotifyPublicPlaylist] YouTube search failed for "${title}": ${err}`);
    }

    // Small delay to avoid YouTube rate limiting (302 redirects) during batch sync
    await new Promise((r) => setTimeout(r, 300));

    songsToInsert.push({
      playlist_id: savedPlaylist.id,
      title,
      artist,
      youtube_video_id: videoId,
      youtube_url: videoUrl,
      thumbnail,
      duration,
      position: i,
      liked: false,
    });
  }

  const { error: songsError } = await supabase.from("songs").insert(songsToInsert);
  if (songsError) throw new Error(`Failed to save songs: ${songsError.message}`);

  console.log(`[syncSpotifyPublicPlaylist] Successfully synced: ${savedPlaylist.slug}`);
  return { slug: savedPlaylist.slug };
}
