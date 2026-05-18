import type { YoutubeSearchResult } from "./types";

type YtThumb = { url?: string };
type YtRun = { text?: string };
type YtRenderer = {
  videoId?: string;
  title?: { runs?: YtRun[]; simpleText?: string };
  ownerText?: { runs?: YtRun[] };
  longBylineText?: { runs?: YtRun[] };
  lengthText?: { simpleText?: string; runs?: YtRun[] };
  thumbnail?: { thumbnails?: YtThumb[] };
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

function textFromRuns(data?: { runs?: YtRun[]; simpleText?: string } | null): string {
  if (!data) return "";
  if (data.simpleText) return data.simpleText;
  return (data.runs ?? []).map((r) => r.text ?? "").join("").trim();
}

function parseDurationToSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;

  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }

  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }

  return null;
}

function collectVideoRenderers(node: unknown, out: YtRenderer[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out);
    return;
  }

  const record = node as Record<string, unknown>;
  const maybeRenderer = record.videoRenderer;
  if (maybeRenderer && typeof maybeRenderer === "object") {
    out.push(maybeRenderer as YtRenderer);
  }

  for (const value of Object.values(record)) {
    collectVideoRenderers(value, out);
  }
}

async function runSearch(query: string): Promise<YoutubeSearchItem[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=US`;
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`YouTube search request failed: ${res.status}`);
  }

  const html = await res.text();
  const match =
    html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/) ??
    html.match(/window\["ytInitialData"\] = (\{[\s\S]*?\});<\/script>/);

  if (!match?.[1]) {
    throw new Error("Unable to parse YouTube search results page");
  }

  const initialData = JSON.parse(match[1]) as unknown;
  const renderers: YtRenderer[] = [];
  collectVideoRenderers(initialData, renderers);

  return renderers
    .filter((v) => v.videoId)
    .map((video) => {
      const videoId = video.videoId as string;
      const title = textFromRuns(video.title) || "Unknown title";
      const artist =
        textFromRuns(video.ownerText) || textFromRuns(video.longBylineText) || "Unknown artist";
      const durationText = textFromRuns(video.lengthText);
      const durationSeconds = parseDurationToSeconds(durationText);
      const thumbnailUrl = video.thumbnail?.thumbnails?.at(-1)?.url ?? null;

      return {
        videoId,
        title,
        artist,
        durationSeconds,
        thumbnailUrl,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      } satisfies YoutubeSearchItem;
    });
}

export async function searchYoutubeVideos(query: string, limit = 10) {
  let videos: YoutubeSearchItem[] = [];

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

  return videos.slice(0, limit);
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
