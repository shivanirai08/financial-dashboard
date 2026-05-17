'use client';

import { useState } from 'react';
import type { StoredPlaylist } from '@/lib/types';

type PlaylistPlayerProps = {
  playlist: StoredPlaylist;
};

export function PlaylistPlayer({ playlist }: PlaylistPlayerProps) {
  const [showVideo, setShowVideo] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  const toggleHistory = (trackId: string) => {
    const newExpanded = new Set(expandedHistory);
    if (newExpanded.has(trackId)) {
      newExpanded.delete(trackId);
    } else {
      newExpanded.add(trackId);
    }
    setExpandedHistory(newExpanded);
  };

  const firstPlayable = playlist.items.find((item) => item.youtubeVideoId);

  return (
    <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-4">
        <div className="flex flex-col gap-4">
          <button
            onClick={() => setShowVideo(!showVideo)}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white/15 hover:border-white/30"
          >
            {showVideo ? '🎵 Hide Video' : '🎬 Show Video'}
          </button>

          {showVideo ? (
            <div className="transition-opacity duration-300 ease-in-out">
              {firstPlayable ? (
                <iframe
                  className="aspect-video w-full rounded-[1.25rem] border border-white/10"
                  src={`https://www.youtube.com/embed/${firstPlayable.youtubeVideoId}`}
                  title={firstPlayable.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-[1.25rem] border border-dashed border-white/15 text-sm text-slate-400">
                  No matched video is available for preview yet.
                </div>
              )}
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-[1.25rem] border border-dashed border-white/15 text-sm text-slate-400 bg-white/5">
              Video hidden • Click &quot;Show Video&quot; to view
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-3">
        {playlist.items.map((item) => (
          <div key={item.id}>
            <article className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h2 className="text-base font-medium text-white">
                    {item.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {item.artist} · {item.album}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                    {item.matchStatus}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  {item.youtubeUrl ? (
                    <a
                      className="secondary-button text-center"
                      href={item.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Watch
                    </a>
                  ) : null}
                  {item.youtubeResults && item.youtubeResults.length > 0 && (
                    <button
                      onClick={() => toggleHistory(item.id)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-white/15 hover:border-white/30"
                    >
                      {expandedHistory.has(item.id) ? '🎬 Hide' : '🎬 More'} ({item.youtubeResults.length})
                    </button>
                  )}
                </div>
              </div>
            </article>

            {expandedHistory.has(item.id) && item.youtubeResults && item.youtubeResults.length > 0 && (
              <div className="mt-2 ml-4 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  YouTube Search Results
                </p>
                {item.youtubeResults.map((result, idx) => (
                  <a
                    key={result.videoId}
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-white/10 bg-white/[0.03] p-2.5 transition-all hover:bg-white/10 hover:border-white/20"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {idx + 1}. {result.title}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {result.channel}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">↗</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
