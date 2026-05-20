import { Readable } from "node:stream";
import cors from "cors";
import express from "express";
import YTDlpWrap from "yt-dlp-wrap";

const app = express();

const PORT = Number(process.env.PORT || 8080);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const REQUEST_TIMEOUT_MS = Number(process.env.SOURCE_TIMEOUT_MS || 5000);
const CACHE_TTL_MS = Number(process.env.STREAM_URL_CACHE_TTL_MS || 60 * 60 * 1000);
const YTDLP_BIN_PATH = process.env.YTDLP_PATH || "/tmp/yt-dlp";

const ytDlpWrap = new YTDlpWrap(YTDLP_BIN_PATH);
let ytDlpReadyPromise = null;

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

function pickBestAudioFormat(formats) {
  const audioOnly = (formats || []).filter((format) => {
    if (!format?.url) return false;
    if (!format?.acodec || format.acodec === "none") return false;
    if (format?.vcodec && format.vcodec !== "none") return false;
    return true;
  });

  const extRank = {
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

  return audioOnly[0] || null;
}

async function extractStreamUrl(videoId) {
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

  const parsed = JSON.parse(output);
  const best = pickBestAudioFormat(parsed?.formats);

  if (!best?.url) return null;
  if (!(await isPlayableStreamUrl(best.url))) return null;

  return best.url;
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
    console.error(
      `[audio/${videoId}] yt-dlp extraction error:`,
      error instanceof Error ? error.message : "unknown error"
    );
    return res.status(500).json({ error: "Extraction failed" });
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
