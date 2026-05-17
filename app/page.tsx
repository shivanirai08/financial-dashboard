import { HomeClient } from "@/components/home-client";
import { createServerSupabase } from "@/lib/supabase";
import type { DbPlaylist } from "@/lib/types";

export default async function Home() {
  let playlists: Pick<DbPlaylist, "id" | "name" | "slug" | "created_at">[] = [];
  try {
    const supabase = createServerSupabase();
    const { data } = await supabase
      .from("playlists")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false })
      .limit(12);
    playlists = (data ?? []) as typeof playlists;
  } catch {
    // Supabase not configured yet — show empty library
  }

  return <HomeClient playlists={playlists} />;
}
