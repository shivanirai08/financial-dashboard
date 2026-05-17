import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { PlaylistGrid } from "@/components/playlist-grid";
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
  const matchedCount = songs.filter((s) => s.youtube_video_id).length;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#07111f_0%,_#04070d_100%)] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        {/* Header */}
        <section className="rounded-[2rem] border border-white/8 bg-white/[0.04] p-7 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Playlist</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {playlist.name}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-400">
            <span>{songs.length} songs</span>
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            <span>{matchedCount} matched on YouTube</span>
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            <span>{new Date(playlist.created_at).toLocaleDateString()}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Click any song to play. Use the bar at the bottom to control playback.
          </p>
        </section>

        {/* Songs */}
        <PlaylistGrid songs={songs} />
      </div>
    </main>
  );
}
