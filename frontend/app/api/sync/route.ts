import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      message:
        "User library sync is no longer supported. Use public playlist sync instead.",
      info: "Submit a public Spotify playlist URL to /api/sync/public (POST with 'playlist' form field)",
      example: "POST /api/sync/public with playlist='https://open.spotify.com/playlist/...'",
    },
    { status: 410 }
  );
}
