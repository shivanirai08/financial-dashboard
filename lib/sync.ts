import type { PlaylistTrack } from "@/lib/types";
import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistDetails,
  getPlaylistTracks,
} from "@/lib/spotify";
import { storePlaylist } from "@/lib/storage";
import { searchYoutubeVideo, getYoutubeSearchResults } from "@/lib/youtube";
import crypto from "node:crypto";

export async function syncSpotifyPublicPlaylist(playlistInput: string) {
  const playlistId = extractSpotifyPlaylistId(playlistInput);

  if (!playlistId) {
    throw new Error("Invalid Spotify playlist URL or ID.");
  }

  const playlist = await fetchSpotifyPlaylistDetails(playlistId);
  const trackStrings = await getPlaylistTracks(playlistId);
  const items: PlaylistTrack[] = [];

  for (const trackString of trackStrings) {
    // trackString is in format "Song Name - Artist Name"
    const [title, artist] = trackString.split(" - ").map(s => s.trim());
    const query = `${title} ${artist} official audio`;
    const result = await searchYoutubeVideo(query);
    const allResults = await getYoutubeSearchResults(query, 5);

    items.push({
      id: crypto.randomUUID(),
      title: title || "Unknown",
      artist: artist || "Unknown",
      album: "",
      spotifyTrackId: null,
      youtubeVideoId: result?.videoId ?? null,
      youtubeUrl: result?.url ?? null,
      youtubeResults: allResults,
      matchStatus: result ? "matched" : "unmatched",
    });
  }

  return storePlaylist({
    id: playlist.id,
    name: playlist.name,
    source: "spotify",
    syncedAt: new Date().toISOString(),
    items,
  });
}
