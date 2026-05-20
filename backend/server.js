import { Readable } from "node:stream";
import { writeFile } from "node:fs/promises";
import cors from "cors";
import express from "express";
import YTDlpWrapModule from "yt-dlp-wrap";

const app = express();

const PORT = Number(process.env.PORT || 8080);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const REQUEST_TIMEOUT_MS = Number(process.env.SOURCE_TIMEOUT_MS || 5000);
const CACHE_TTL_MS = Number(process.env.STREAM_URL_CACHE_TTL_MS || 60 * 60 * 1000);
const YTDLP_BIN_PATH = process.env.YTDLP_PATH || "/tmp/yt-dlp";
const YTDLP_COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || "/tmp/yt-cookies.txt";

const YTDlpWrap = YTDlpWrapModule?.default ?? YTDlpWrapModule;
const ytDlpWrap = new YTDlpWrap(YTDLP_BIN_PATH);
let ytDlpReadyPromise = null;
let cookiesReadyPromise = null;

const streamUrlCache = new Map();

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN }));
app.use(express.json());

function isValidVideoId(videoId) {
  return typeof videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

async function ensureYtDlpReady() {
  if (process.env.YTDLP_PATH) return;

  if (!ytDlpReadyPromise) {
    ytDlpReadyPromise = YTDlpWrap.downloadFromGithub(YTDLP_BIN_PATH).then(() => {
      // Binary downloaded.
    });
  }

  await ytDlpReadyPromise;
}

async function ensureCookiesFile() {
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

function isBotChallengeErrorMessage(message) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("sign in to confirm you're not a bot") ||
    lowered.includes("use --cookies")
  );
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function isPlayableStreamUrl(streamUrl) {
  try {
    const head = await fetchWithTimeout(streamUrl, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (head.ok) return true;
  } catch {
    // Some sources reject HEAD.
  }

  try {
    const probe = await fetchWithTimeout(streamUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Range: "bytes=0-0",
      },
    });
    return probe.ok || probe.status === 206;
  } catch {
    return false;
  }
}

async function extractStreamUrl(videoId) {
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
  if (!(await isPlayableStreamUrl(streamUrl))) return null;

  return streamUrl;
}

async function resolveStreamUrl(videoId) {
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    const stillValid = await isPlayableStreamUrl(cached.streamUrl);
    if (stillValid) return cached.streamUrl;
    streamUrlCache.delete(videoId);
  }

  const extracted = await extractStreamUrl(videoId);
  if (!extracted) return null;

  streamUrlCache.set(videoId, {
    streamUrl: extracted,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  if (streamUrlCache.size > 400) {
    const now = Date.now();
    for (const [key, value] of streamUrlCache.entries()) {
      if (value.expiresAt < now) streamUrlCache.delete(key);
    }
  }

  return extracted;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "pulsebox-stream-backend",
    extractor: "yt-dlp",
    time: new Date().toISOString(),
  });
});

app.get("/api/youtube/audio/:videoId", async (req, res) => {
  const { videoId } = req.params;
  if (!isValidVideoId(videoId)) {
    return res.status(400).json({ error: "Invalid video ID" });
  }

  try {
    const streamUrl = await resolveStreamUrl(videoId);
    if (!streamUrl) {
      return res.status(404).json({ error: "No playable audio stream available" });
    }

    return res.json({ streamUrl, url: streamUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const botChallenge = isBotChallengeErrorMessage(message);

    console.error(
      `[audio/${videoId}] yt-dlp extraction error:`,
      message
    );

    if (botChallenge) {
      return res.status(503).json({
        error: "YouTube bot challenge. Configure YTDLP_COOKIES_FILE or YTDLP_COOKIES_B64.",
        code: "YOUTUBE_BOT_CHALLENGE",
      });
    }

    return res.status(500).json({ error: "Extraction failed", code: "EXTRACTION_FAILED" });
  }
});

app.get("/api/stream/:videoId", async (req, res) => {
  const { videoId } = req.params;
  if (!isValidVideoId(videoId)) {
    return res.status(400).json({ error: "Invalid video ID" });
  }

  try {
    const streamUrl = await resolveStreamUrl(videoId);
    if (!streamUrl) {
      return res.status(404).json({ error: "No playable audio stream available" });
    }

    const sourceHeaders = { "User-Agent": "Mozilla/5.0" };
    if (req.headers.range) {
      sourceHeaders.Range = req.headers.range;
    }

    const sourceRes = await fetch(streamUrl, { headers: sourceHeaders });
    if (!sourceRes.ok || !sourceRes.body) {
      return res.status(502).json({ error: "Failed to fetch audio source" });
    }

    const contentType = sourceRes.headers.get("Content-Type") || "audio/mpeg";
    const contentLength = sourceRes.headers.get("Content-Length");
    const contentRange = sourceRes.headers.get("Content-Range");

    res.status(sourceRes.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=60");

    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);

    Readable.fromWeb(sourceRes.body).pipe(res);
  } catch (error) {
    console.error(
      `[stream/${videoId}] stream proxy error:`,
      error instanceof Error ? error.message : "unknown error"
    );
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`pulsebox-stream-backend listening on port ${PORT}`);
});
