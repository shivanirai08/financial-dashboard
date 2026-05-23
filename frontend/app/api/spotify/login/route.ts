import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      message:
        "User-based OAuth login is no longer needed. Use the public playlist sync feature instead.",
      info: "The app now uses client credentials flow for Spotify access. Submit a public playlist URL via /api/sync/public instead.",
    },
    { status: 410 }
  );
}
