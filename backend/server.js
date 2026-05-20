const express = require("express");
const cors = require("cors");
const { Innertube } = require("youtubei.js");

const app = express();

const PORT = Number(process.env.PORT || 8080);
const SOURCE_TIMEOUT_MS = Number(process.env.SOURCE_TIMEOUT_MS || 4500);
const INVIDIOUS_DISCOVERY_TTL_MS = Number(
  process.env.INVIDIOUS_DISCOVERY_TTL_MS || 60 * 60 * 1000
);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN }));
app.use(express.json());

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
  "https://api.piped.privacydevs.net",
  "https://pipedapi.darkness.services",
];

let innertubeInstance = null;
let instanceCreatedAt = 0;
const INSTANCE_TTL_MS = 30 * 60 * 1000;

let cachedInvidiousInstances = [];
let invidiousCachedAt = 0;

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

function isValidVideoId(videoId) {
  return typeof videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

async function getInnertube() {
  const now = Date.now();
  if (!innertubeInstance || now - instanceCreatedAt > INSTANCE_TTL_MS) {
    innertubeInstance = await Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
    });
    instanceCreatedAt = now;
  }
  return innertubeInstance;
}

async function getInvidiousInstances() {
  if (
    cachedInvidiousInstances.length > 0 &&
    Date.now() - invidiousCachedAt < INVIDIOUS_DISCOVERY_TTL_MS
  ) {
    return cachedInvidiousInstances;
  }

  try {
    const res = await fetch("https://api.invidious.io/instances.json", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (res.ok) {
      const data = await res.json();
      const instances = data
        .filter((row) => row?.[1]?.api === true && !!row?.[1]?.uri)
        .sort((a, b) => (b?.[1]?.monitor?.uptime || 0) - (a?.[1]?.monitor?.uptime || 0))
        .map((row) => row[1].uri)
        .slice(0, 8);

      if (instances.length > 0) {
        cachedInvidiousInstances = instances;
        invidiousCachedAt = Date.now();
      }
    }
  } catch {
    // Keep stale cache if discovery fails.
  }

  if (cachedInvidiousInstances.length > 0) {
    return cachedInvidiousInstances;
  }

  return [
    "https://inv.nadeko.net",
    "https://invidious.projectsegfau.lt",
    "https://invidious.privacyredirect.com",
  ];
}

async function resolveInnertubeAudioUrl(yt, videoId, client) {
  const info = await yt.getInfo(videoId, { client });
  const adaptiveFormats = info?.streaming_data?.adaptive_formats || [];
  const regularFormats = info?.streaming_data?.formats || [];
  const allFormats = [...adaptiveFormats, ...regularFormats];
  if (allFormats.length === 0) return null;

  const audioFormats = allFormats
    .filter((f) => {
      const mime = f?.mime_type || "";
      return mime.startsWith("audio/") || mime.includes("audio/");
    })
    .sort((a, b) => {
      const aIsMp4 = a?.mime_type?.includes("mp4a") ? 1 : 0;
      const bIsMp4 = b?.mime_type?.includes("mp4a") ? 1 : 0;
      return bIsMp4 - aIsMp4 || (b?.bitrate || 0) - (a?.bitrate || 0);
    });

  for (const format of audioFormats) {
    if (isHttpUrl(format?.url)) return format.url;
    try {
      const deciphered = await format.decipher(yt.session.player);
      if (isHttpUrl(deciphered)) return deciphered;
    } catch {
      // Try next format.
    }
  }

  // Some videos only expose muxed A/V formats for certain clients.
  // As a final Innertube attempt, pick highest bitrate format containing audio.
  const muxedFormats = allFormats
    .filter((f) => {
      const mime = f?.mime_type || "";
      return mime.includes("audio/");
    })
    .sort((a, b) => (b?.bitrate || 0) - (a?.bitrate || 0));

  for (const format of muxedFormats) {
    if (isHttpUrl(format?.url)) return format.url;
    try {
      const deciphered = await format.decipher(yt.session.player);
      if (isHttpUrl(deciphered)) return deciphered;
    } catch {
      // Try next format.
    }
  }

  return null;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getAudioUrl(videoId) {
  try {
    const yt = await getInnertube();
    const clients = ["WEB_EMBEDDED", "ANDROID", "IOS", "WEB", "TV_EMBEDDED"];

    for (const client of clients) {
      try {
        console.log(`[stream/${videoId}] Innertube: ${client}`);
        const url = await resolveInnertubeAudioUrl(yt, videoId, client);
        if (url) {
          console.log(`[stream/${videoId}] Got URL from Innertube ${client}`);
          return url;
        }
      } catch {
        // Continue with next client.
      }
    }
  } catch (e) {
    console.warn(
      `[stream/${videoId}] Innertube failed:`,
      (e && e.message ? e.message : "unknown error").toString().slice(0, 120)
    );
    innertubeInstance = null;
  }

  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`[stream/${videoId}] Piped: ${instance}`);
      const res = await fetchWithTimeout(`${instance}/streams/${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const candidates = [
        ...(data?.audioStreams || []),
        ...(data?.adaptiveFormats || []),
      ]
        .filter((s) => isHttpUrl(s?.url))
        .sort((a, b) => (b?.bitrate || 0) - (a?.bitrate || 0));

      if (candidates[0]?.url) {
        console.log(`[stream/${videoId}] Got URL from Piped ${instance}`);
        return candidates[0].url;
      }
    } catch {
      // Continue with next instance.
    }
  }

  const invidiousInstances = await getInvidiousInstances();
  for (const instance of invidiousInstances) {
    try {
      console.log(`[stream/${videoId}] Invidious: ${instance}`);
      const res = await fetchWithTimeout(`${instance}/api/v1/videos/${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const candidates = [
        ...(data?.adaptiveFormats || []),
        ...(data?.formatStreams || []),
      ]
        .filter((s) => {
          if (!isHttpUrl(s?.url)) return false;
          const mime = s?.mime_type || s?.mimeType || s?.type || "";
          return mime.includes("audio/");
        })
        .sort((a, b) => (b?.bitrate || 0) - (a?.bitrate || 0));

      if (candidates[0]?.url) {
        console.log(`[stream/${videoId}] Got URL from Invidious ${instance}`);
        return candidates[0].url;
      }
    } catch {
      // Continue with next instance.
    }
  }

  console.error(`[stream/${videoId}] All sources exhausted`);
  return null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "pulsebox-stream-backend", time: new Date().toISOString() });
});

app.get("/api/youtube/audio/:videoId", async (req, res) => {
  const { videoId } = req.params;
  if (!isValidVideoId(videoId)) {
    return res.status(400).json({ error: "Invalid video ID" });
  }

  try {
    const url = await getAudioUrl(videoId);
    if (!url) {
      return res.status(404).json({ error: "No audio available" });
    }

    return res.json({ streamUrl: url, url });
  } catch (error) {
    console.error(`[audio/${videoId}] Error:`, error?.message || "unknown error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/stream/:videoId", async (req, res) => {
  const { videoId } = req.params;
  if (!isValidVideoId(videoId)) {
    return res.status(400).json({ error: "Invalid video ID" });
  }

  try {
    const audioUrl = await getAudioUrl(videoId);
    if (!audioUrl) {
      return res.status(404).json({ error: "No audio available" });
    }

    const sourceHeaders = { "User-Agent": "Mozilla/5.0" };
    const rangeHeader = req.headers.range;
    if (rangeHeader) sourceHeaders.Range = rangeHeader;

    const sourceRes = await fetch(audioUrl, { headers: sourceHeaders });
    if (!sourceRes.ok || !sourceRes.body) {
      return res.status(502).json({ error: "Failed to fetch audio" });
    }

    const contentType = sourceRes.headers.get("Content-Type") || "audio/mpeg";
    const contentLength = sourceRes.headers.get("Content-Length");
    const contentRange = sourceRes.headers.get("Content-Range");

    res.status(sourceRes.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);

    const nodeStream = require("stream");
    nodeStream.Readable.fromWeb(sourceRes.body).pipe(res);
  } catch (error) {
    console.error(
      `[stream/${videoId}] Error:`,
      (error && error.message ? error.message : "unknown error").toString().slice(0, 120)
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`pulsebox-stream-backend listening on port ${PORT}`);
});
