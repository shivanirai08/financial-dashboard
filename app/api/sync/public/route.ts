import { NextRequest, NextResponse } from "next/server";
import { syncSpotifyPublicPlaylist } from "@/lib/sync";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const playlistInput = String(form.get("playlist") ?? "").trim();

  if (!playlistInput) {
    return NextResponse.json(
      { error: "Missing playlist URL or ID." },
      { status: 400 }
    );
  }

  try {
    const result = await syncSpotifyPublicPlaylist(playlistInput);
    return NextResponse.json({ slug: result.slug });
  } catch (error) {
    console.error("[sync/public] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
