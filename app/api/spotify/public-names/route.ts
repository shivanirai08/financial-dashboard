import { NextRequest, NextResponse } from "next/server";
import {
  extractSpotifyPlaylistId,
  fetchSpotifyAppAccessToken,
  fetchSpotifyPlaylistDetails,
  fetchSpotifyPlaylistTrackNames,
} from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playlistInput = searchParams.get("playlist")?.trim() ?? "";

  if (!playlistInput) {
    return NextResponse.json(
      { error: "Missing 'playlist' query parameter." },
      { status: 400 },
    );
  }

  const playlistId = extractSpotifyPlaylistId(playlistInput);

  if (!playlistId) {
    return NextResponse.json(
      { error: "Invalid Spotify playlist URL or playlist ID." },
      { status: 400 },
    );
  }

  try {
    const appAccessToken = await fetchSpotifyAppAccessToken();
    const playlist = await fetchSpotifyPlaylistDetails(appAccessToken, playlistId);
    const songs = await fetchSpotifyPlaylistTrackNames(appAccessToken, playlistId);

    return NextResponse.json({
      playlist,
      totalSongs: songs.length,
      songs,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Failed to fetch playlist names from Spotify API. Verify playlist is public and credentials are valid.",
      },
      { status: 502 },
    );
  }
}
