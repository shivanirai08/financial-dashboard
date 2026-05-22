import type { YoutubeSearchItem } from "@/types";
import { parseTimestamp } from "@/utils/format";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function walk(value: unknown, visit: (item: JsonRecord) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  Object.values(value).forEach((item) => walk(item, visit));
}

function extractJsonObject(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = source.indexOf("{", markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function pickText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (!isRecord(value)) return null;
  if (typeof value.simpleText === "string" && value.simpleText.trim()) {
    return value.simpleText.trim();
  }
  if (Array.isArray(value.runs)) {
    const text = value.runs
      .map((run) => (isRecord(run) && typeof run.text === "string" ? run.text : ""))
      .join("")
      .trim();
    return text || null;
  }
  return null;
}

export async function searchYouTubeVideos(query: string, limit = 10): Promise<YoutubeSearchItem[]> {
  const response = await fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`
  );
  const html = await response.text();
  const rawJson =
    extractJsonObject(html, "var ytInitialData =") ??
    extractJsonObject(html, "window[\"ytInitialData\"] =") ??
    extractJsonObject(html, "ytInitialData =");

  if (!rawJson) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }

  const results: YoutubeSearchItem[] = [];
  const seen = new Set<string>();

  walk(parsed, (item) => {
    const renderer = isRecord(item.videoRenderer) ? item.videoRenderer : null;
    if (!renderer) return;

    const videoId = typeof renderer.videoId === "string" ? renderer.videoId : null;
    if (!videoId || seen.has(videoId)) return;

    const title = pickText(renderer.title) ?? "Unknown title";
    const artist =
      pickText(renderer.ownerText) ??
      pickText(renderer.longBylineText) ??
      pickText(renderer.shortBylineText) ??
      "Unknown artist";
    const durationSeconds = parseTimestamp(pickText(renderer.lengthText) ?? undefined);
    const thumbnails = isRecord(renderer.thumbnail) && Array.isArray(renderer.thumbnail.thumbnails)
      ? renderer.thumbnail.thumbnails
      : [];
    const thumbnailUrl = thumbnails.length
      ? isRecord(thumbnails[thumbnails.length - 1]) && typeof thumbnails[thumbnails.length - 1].url === "string"
        ? thumbnails[thumbnails.length - 1].url
        : null
      : null;

    seen.add(videoId);
    results.push({
      videoId,
      title,
      artist,
      durationSeconds,
      thumbnailUrl,
      url: `https://www.youtube.com/watch?v=${videoId}`
    });
  });

  return results.slice(0, limit);
}
