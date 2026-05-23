import { createServerSupabase } from "@/lib/supabase";
import { PlaylistGrid } from "@/components/playlist-grid";
import { FavsHeader } from "@/components/favs-header";
import type { DbSong } from "@/lib/types";

export default async function FavsPage() {
  let songs: DbSong[] = [];

  try {
    const supabase = createServerSupabase();
    const { data } = await supabase
      .from("songs")
      .select("*")
      .eq("liked", true)
      .order("created_at", { ascending: false });
    songs = (data ?? []) as DbSong[];
  } catch {
    // Supabase not configured — show empty
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#07111f_0%,_#04070d_100%)] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <FavsHeader count={songs.length} />

        {songs.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-12 text-center">
            <p className="text-slate-400">No liked songs yet.</p>
            <p className="mt-1 text-sm text-slate-500">
              Tap the ♡ on any song to add it here.
            </p>
          </div>
        ) : (
          <PlaylistGrid songs={songs} />
        )}
      </div>
    </main>
  );
}
