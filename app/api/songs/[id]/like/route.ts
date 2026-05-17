import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing song id" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  const { data: song, error: fetchError } = await supabase
    .from("songs")
    .select("liked")
    .eq("id", id)
    .single();

  if (fetchError || !song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  const newLiked = !song.liked;

  const { error: updateError } = await supabase
    .from("songs")
    .update({ liked: newLiked })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ liked: newLiked });
}
