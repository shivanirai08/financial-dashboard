import { createServerSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

/** POST /api/playlists/[id]/songs — add a song to a playlist */
export async function POST(req: NextRequest, { params }: Params) {
  const { id: playlistId } = await params;

  let body: {
    title?: string;
    artist?: string;
    youtube_video_id?: string;
    youtube_url?: string;
    thumbnail?: string;
    duration?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Get the current max position
  const { data: lastSong } = await supabase
    .from("songs")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const position = (lastSong?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("songs")
    .insert({
      playlist_id: playlistId,
      title: body.title,
      artist: body.artist ?? "",
      youtube_video_id: body.youtube_video_id ?? null,
      youtube_url: body.youtube_url ?? null,
      thumbnail: body.thumbnail ?? null,
      duration: body.duration ?? null,
      position,
      liked: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ song: data });
}
