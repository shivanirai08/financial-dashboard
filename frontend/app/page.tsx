import { HomeClient } from "@/components/home-client";
import { createServerSupabase } from "@/lib/supabase";
import type { DbPlaylist } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let playlists: Pick<DbPlaylist, "id" | "name" | "slug" | "created_at">[] = [];
  let likedCount = 0;
  try {
    const supabase = createServerSupabase();
    const [playlistsResult, likedResult] = await Promise.all([
      supabase
        .from("playlists")
        .select("id, name, slug, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("songs")
        .select("id", { count: "exact", head: true })
        .eq("liked", true),
    ]);
    playlists = (playlistsResult.data ?? []) as typeof playlists;
    likedCount = likedResult.count ?? 0;
  } catch {
    // Supabase not configured yet — show empty library
  }

  return <HomeClient playlists={playlists} likedCount={likedCount} />;
}
