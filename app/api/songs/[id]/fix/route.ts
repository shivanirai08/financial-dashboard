import { createServerSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { youtube_video_id?: string; youtube_url?: string; thumbnail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { youtube_video_id, youtube_url, thumbnail } = body;
  if (!youtube_video_id) {
    return NextResponse.json({ error: "youtube_video_id is required" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("songs")
    .update({ youtube_video_id, youtube_url: youtube_url ?? null, thumbnail: thumbnail ?? null })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ song: data });
}
