import { NextRequest, NextResponse } from "next/server";
import { syncSpotifyPublicPlaylist } from "@/lib/sync";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const playlistInput = String(form.get("playlist") ?? "").trim();

  if (!playlistInput) {
    return NextResponse.redirect(
      new URL("/?error=missing-spotify-playlist", request.url),
    );
  }

  try {
    const stored = await syncSpotifyPublicPlaylist(playlistInput);
    return NextResponse.redirect(new URL(`/playlist/${stored.slug}`, request.url));
  } catch {
    return NextResponse.redirect(
      new URL("/?error=spotify-public-sync-failed", request.url),
    );
  }
}
