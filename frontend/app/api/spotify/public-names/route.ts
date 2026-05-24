import { NextRequest, NextResponse } from "next/server";
import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistDetails,
  getPlaylistTracks,
} from "@/lib/spotify";

export const maxDuration = 300; // 5 minutes (hobby plan max)

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
    const playlist = await fetchSpotifyPlaylistDetails(playlistId);
    const trackStrings = await getPlaylistTracks(playlistId);

    // Convert "Song - Artist" format to objects
    const songs = trackStrings.map(trackString => {
      const [name, artist] = trackString.split(" - ").map(s => s.trim());
      return { name, artist };
    });

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
