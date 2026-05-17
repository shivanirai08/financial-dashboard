import type { PlaylistTrack, SpotifyToken } from "@/lib/types";
import {
  extractSpotifyPlaylistId,
  fetchSpotifyAppAccessToken,
  fetchSpotifyPlaylistDetails,
  fetchSpotifyPlaylists,
  fetchSpotifyPlaylistTracks,
  refreshSpotifyToken,
} from "@/lib/spotify";
import { storePlaylist } from "@/lib/storage";
import { searchYoutubeVideo } from "@/lib/youtube";

function parseSpotifyToken(rawToken: string) {
  return JSON.parse(rawToken) as SpotifyToken;
}

export async function syncSpotifyLibrary(rawToken: string) {
  let token = parseSpotifyToken(rawToken);

  if (token.refresh_token) {
    token = await refreshSpotifyToken(token.refresh_token);
  }

  const playlists = await fetchSpotifyPlaylists(token.access_token);

  for (const playlist of playlists) {
    const tracks = await fetchSpotifyPlaylistTracks(token.access_token, playlist.id);
    const items: PlaylistTrack[] = [];

    for (const track of tracks) {
      const result = await searchYoutubeVideo(
        `${track.title} ${track.artist} official audio`,
      );

      items.push({
        ...track,
        youtubeVideoId: result?.videoId ?? null,
        youtubeUrl: result?.url ?? null,
        matchStatus: result ? "matched" : "unmatched",
      });
    }

    await storePlaylist({
      id: playlist.id,
      name: playlist.name,
      source: "spotify",
      syncedAt: new Date().toISOString(),
      items,
    });
  }

  return token;
}

export async function syncSpotifyPublicPlaylist(playlistInput: string) {
  const playlistId = extractSpotifyPlaylistId(playlistInput);

  if (!playlistId) {
    throw new Error("Invalid Spotify playlist URL or ID.");
  }

  const appAccessToken = await fetchSpotifyAppAccessToken();
  const playlist = await fetchSpotifyPlaylistDetails(appAccessToken, playlistId);
  const tracks = await fetchSpotifyPlaylistTracks(appAccessToken, playlist.id);
  const items: PlaylistTrack[] = [];

  for (const track of tracks) {
    const result = await searchYoutubeVideo(
      `${track.title} ${track.artist} official audio`,
    );

    items.push({
      ...track,
      youtubeVideoId: result?.videoId ?? null,
      youtubeUrl: result?.url ?? null,
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
