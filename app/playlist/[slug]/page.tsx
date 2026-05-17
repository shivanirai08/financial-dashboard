import { notFound } from "next/navigation";
import { getStoredPlaylistBySlug } from "@/lib/storage";
import { PlaylistPlayer } from "@/components/playlist-player";

type PlaylistPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PlaylistPage({ params }: PlaylistPageProps) {
  const { slug } = await params;
  const playlist = await getStoredPlaylistBySlug(slug);

  if (!playlist) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#07111f_0%,_#04070d_100%)] px-6 py-10 text-white sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-white/10 bg-white/6 p-8 backdrop-blur">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">
            Playlist view
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {playlist.name}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
            Embedded playback uses YouTube video pages or embeds for matched
            tracks. Unmatched items remain in the library so you can review them
            later.
          </p>
        </section>

        <PlaylistPlayer playlist={playlist} />
      </div>
    </main>
  );
}
