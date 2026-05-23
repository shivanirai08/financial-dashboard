import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      message:
        "OAuth callback is no longer needed. The app now uses client credentials flow.",
      info: "Public playlists can be synced directly without user authentication.",
    },
    { status: 410 }
  );
}
