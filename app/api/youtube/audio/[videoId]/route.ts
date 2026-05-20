import { NextRequest, NextResponse } from "next/server";
import YTDlpWrap from "yt-dlp-wrap";

export const runtime = "nodejs";
export const maxDuration = 30;

type ExtractedFormat = {
  acodec?: string;
  vcodec?: string;
  ext?: string;
  abr?: number;
  tbr?: number;
  url?: string;
};

type ExtractedInfo = {
  formats?: ExtractedFormat[];
};

const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const YTDLP_BIN_PATH = process.env.YTDLP_PATH || "/tmp/yt-dlp";

const ytDlpWrap = new YTDlpWrap(YTDLP_BIN_PATH);
let ytDlpReadyPromise: Promise<void> | null = null;

const audioUrlCache = new Map<string, { streamUrl: string; expiresAt: number }>();

async function ensureYtDlpReady() {
  if (process.env.YTDLP_PATH) return;

  if (!ytDlpReadyPromise) {
    ytDlpReadyPromise = YTDlpWrap.downloadFromGithub(YTDLP_BIN_PATH).then(() => {
      // Binary downloaded and executable.
    });
  }

  await ytDlpReadyPromise;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function isPlayableStreamUrl(streamUrl: string): Promise<boolean> {
  try {
    const head = await fetchWithTimeout(streamUrl, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (head.ok) return true;
  } catch {
    // Some sources reject HEAD; fallback below.
  }

  try {
    const ranged = await fetchWithTimeout(streamUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Range: "bytes=0-0",
      },
    });
    return ranged.ok || ranged.status === 206;
  } catch {
    return false;
  }
}

function pickBestAudioFormat(formats: ExtractedFormat[]): ExtractedFormat | null {
  const audioOnly = formats.filter((format) => {
    if (!format.url) return false;
    if (!format.acodec || format.acodec === "none") return false;
    if (format.vcodec && format.vcodec !== "none") return false;
    return true;
  });

  const extRank: Record<string, number> = {
    m4a: 3,
    mp4: 3,
    webm: 2,
    opus: 2,
    mp3: 1,
  };

  audioOnly.sort((a, b) => {
    const aExt = extRank[(a.ext || "").toLowerCase()] || 0;
    const bExt = extRank[(b.ext || "").toLowerCase()] || 0;
    if (aExt !== bExt) return bExt - aExt;
    return (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0);
  });

  return audioOnly[0] ?? null;
}

async function extractStreamUrl(videoId: string): Promise<string | null> {
  await ensureYtDlpReady();

  const output = await ytDlpWrap.execPromise([
    `https://www.youtube.com/watch?v=${videoId}`,
    "-J",
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
    "-f",
    "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
  ]);

  const parsed = JSON.parse(output) as ExtractedInfo;
  const best = pickBestAudioFormat(parsed.formats ?? []);
  if (!best?.url) return null;

  const valid = await isPlayableStreamUrl(best.url);
  if (!valid) return null;

  return best.url;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  }

  const cached = audioUrlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    const stillValid = await isPlayableStreamUrl(cached.streamUrl);
    if (stillValid) {
      return NextResponse.json({ streamUrl: cached.streamUrl, url: cached.streamUrl });
    }

    audioUrlCache.delete(videoId);
  }

  let audioUrl: string | null = null;
  try {
    audioUrl = await extractStreamUrl(videoId);
  } catch (error) {
    console.error(
      `[audio/${videoId}] yt-dlp extraction failed:`,
      error instanceof Error ? error.message : "unknown error"
    );
  }

  if (!audioUrl) {
    console.error(`[audio/${videoId}] No playable URL extracted by yt-dlp`);
    return NextResponse.json(
      { error: "No streaming data available for this video" },
      { status: 404 }
    );
  }

  audioUrlCache.set(videoId, {
    streamUrl: audioUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  if (audioUrlCache.size > 400) {
    const now = Date.now();
    for (const [key, val] of audioUrlCache) {
      if (val.expiresAt < now) audioUrlCache.delete(key);
    }
  }

  return NextResponse.json({ streamUrl: audioUrl, url: audioUrl });
}
