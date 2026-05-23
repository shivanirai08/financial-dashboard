import ytSearch from "yt-search";
import { load as loadHtml } from "cheerio";
import type { YoutubeSearchResult } from "./types";

type YtAuthor = {
  name?: string;
};

type YtVideo = {
  videoId?: string;
  title?: string;
  author?: YtAuthor;
  timestamp?: string;
  duration?: {
    seconds?: number;
  };
  image?: string;
};

type YtSearchResult = {
  videos?: YtVideo[];
};

export type YoutubeSearchItem = {
  videoId: string;
  title: string;
  artist: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  url: string;
};

/**
 * Produce a simplified retry query from the original.
 * Strips parentheticals, brackets, pipes, qualifiers — then appends " song"
 * for better YouTube match quality.
 */
function simplifyQuery(query: string): string {
  return (
    query
      .replace(/\s*\([^)]*\)/gi, "")       // strip (From "Movie"), (feat. X), etc.
      .replace(/\s*\[[^\]]*\]/gi, "")       // strip [Official Video], etc.
      .replace(/\s*\|.*$/g, "")             // strip | Coke Studio Bharat, etc.
      .replace(/\s+official\s+(audio|video|lyric(s)?|music\s+video)/gi, "")
      .replace(/\s+lyrics?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() + " song"
  );
}

async function runSearch(query: string): Promise<YtVideo[]> {
  // Keep a direct runtime reference so server output tracing includes cheerio.
  if (typeof loadHtml !== "function") {
    throw new Error("cheerio runtime is unavailable");
  }

  const result = (await ytSearch(query)) as YtSearchResult;
  return result.videos ?? [];
}

export async function searchYoutubeVideos(query: string, limit = 10) {
  let videos: YtVideo[] = [];

  try {
    videos = await runSearch(query);
  } catch {
    // On 302 / redirect / bot-check, retry with a stripped-down query
    const stripped = simplifyQuery(query);
    if (stripped && stripped !== query) {
      try {
        videos = await runSearch(stripped);
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  return videos
    .filter((video) => video.videoId)
    .slice(0, limit)
    .map((video) => {
      const videoId = video.videoId as string;
      return {
        videoId,
        title: video.title ?? "Unknown title",
        artist: video.author?.name ?? "Unknown artist",
        durationSeconds: video.duration?.seconds ?? null,
        thumbnailUrl: video.image ?? null,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      } satisfies YoutubeSearchItem;
    });
}

export async function getYoutubeSearchResults(query: string, limit = 5): Promise<YoutubeSearchResult[]> {
  const results = await searchYoutubeVideos(query, limit);
  return results.map(result => ({
    videoId: result.videoId,
    url: result.url,
    title: result.title,
    channel: result.artist,
  }));
}

export async function searchYoutubeVideo(query: string) {
  const results = await searchYoutubeVideos(query, 1);
  const firstResult = results[0] ?? null;

  if (!firstResult) {
    return null;
  }

  return {
    videoId: firstResult.videoId,
    url: firstResult.url,
  };
}
