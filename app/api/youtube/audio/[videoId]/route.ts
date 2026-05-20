import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import YTDlpWrapModule from "yt-dlp-wrap";

export const runtime = "nodejs";
export const maxDuration = 30;

const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const YTDLP_BIN_PATH = process.env.YTDLP_PATH || "/tmp/yt-dlp";
const YTDLP_COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || "/tmp/yt-cookies.txt";

const YTDlpWrap =
  (YTDlpWrapModule as unknown as { default?: typeof YTDlpWrapModule }).default ??
  YTDlpWrapModule;
const ytDlpWrap = new YTDlpWrap(YTDLP_BIN_PATH);
let ytDlpReadyPromise: Promise<void> | null = null;
let cookiesReadyPromise: Promise<string> | null = null;

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

async function ensureCookiesFile(): Promise<string | null> {
  if (process.env.YTDLP_COOKIES_FILE) {
    return process.env.YTDLP_COOKIES_FILE;
  }

  const encoded = process.env.YTDLP_COOKIES_B64;
  if (!encoded) return null;

  if (!cookiesReadyPromise) {
    cookiesReadyPromise = writeFile(
      YTDLP_COOKIES_PATH,
      Buffer.from(encoded, "base64").toString("utf8"),
      { mode: 0o600 }
    ).then(() => YTDLP_COOKIES_PATH);
  }

  return cookiesReadyPromise;
}

function isBotChallengeErrorMessage(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("sign in to confirm you're not a bot") ||
    lowered.includes("use --cookies")
  );
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

async function extractStreamUrl(videoId: string): Promise<string | null> {
  await ensureYtDlpReady();
  const cookiesPath = await ensureCookiesFile();

  const args = [
    `https://www.youtube.com/watch?v=${videoId}`,
    "-g",
    "--no-playlist",
    "--no-warnings",
    "--extractor-args",
    "youtube:player_client=android,web",
    "-f",
    "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
  ];

  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  const output = await ytDlpWrap.execPromise(args);

  const streamUrl = output
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!streamUrl) return null;

  const valid = await isPlayableStreamUrl(streamUrl);
  if (!valid) return null;

  return streamUrl;
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
  let extractionErrorMessage = "";
  try {
    audioUrl = await extractStreamUrl(videoId);
  } catch (error) {
    extractionErrorMessage = error instanceof Error ? error.message : "unknown error";
    console.error(
      `[audio/${videoId}] yt-dlp extraction failed:`,
      extractionErrorMessage
    );
  }

  if (!audioUrl) {
    if (isBotChallengeErrorMessage(extractionErrorMessage)) {
      return NextResponse.json(
        {
          error: "YouTube bot challenge. Configure YTDLP_COOKIES_FILE or YTDLP_COOKIES_B64.",
          code: "YOUTUBE_BOT_CHALLENGE",
        },
        { status: 503 }
      );
    }

    console.error(`[audio/${videoId}] No playable URL extracted by yt-dlp`);
    return NextResponse.json(
      { error: "No streaming data available for this video", code: "EXTRACTION_FAILED" },
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
