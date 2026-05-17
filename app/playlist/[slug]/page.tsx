import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { PlaylistGrid } from "@/components/playlist-grid";
import { PlaylistHeader } from "@/components/playlist-header";
import type { DbSong } from "@/lib/types";

type PlaylistPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PlaylistPage({ params }: PlaylistPageProps) {
  const { slug } = await params;

  const supabase = createServerSupabase();

  const { data: playlist } = await supabase
    .from("playlists")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!playlist) notFound();

  const { data: songsRaw } = await supabase
    .from("songs")
    .select("*")
    .eq("playlist_id", playlist.id)
    .order("position", { ascending: true });

  const songs: DbSong[] = songsRaw ?? [];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#07111f_0%,_#04070d_100%)] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PlaylistHeader playlist={playlist} songs={songs} />
        <PlaylistGrid songs={songs} />
      </div>
    </main>
  );
}
