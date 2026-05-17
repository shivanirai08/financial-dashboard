import { createServerSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { slugify } from "@/lib/slug";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/playlists/[id] — rename a playlist */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("playlists")
    .update({ name })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ playlist: data });
}

/** DELETE /api/playlists/[id] — delete a playlist and all its songs */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createServerSupabase();

  // Songs cascade-delete via FK
  const { error } = await supabase.from("playlists").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
