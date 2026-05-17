import { createServerSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { slugify } from "@/lib/slug";

/** POST /api/playlists — create a new empty playlist */
export async function POST(req: NextRequest) {
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

  // Generate a unique slug
  let slug = slugify(name);
  const { data: existing } = await supabase
    .from("playlists")
    .select("slug")
    .eq("slug", slug)
    .single();

  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  const { data, error } = await supabase
    .from("playlists")
    .insert({
      spotify_playlist_id: `manual-${slug}-${Date.now()}`,
      slug,
      name,
      cover_image: null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ playlist: data });
}
