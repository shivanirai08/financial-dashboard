import { NextRequest, NextResponse } from "next/server";
import { Innertube } from "youtubei.js";

export const runtime = "nodejs";
export const maxDuration = 30;

// Cache Innertube instance (expensive to create)
let innertubeInstance: Awaited<ReturnType<typeof Innertube.create>> | null =
  null;
let instanceCreatedAt = 0;
const INSTANCE_TTL = 30 * 60 * 1000; // 30 minutes

async function getInnertube() {
  const now = Date.now();
  if (!innertubeInstance || now - instanceCreatedAt > INSTANCE_TTL) {
    innertubeInstance = await Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
    });
    instanceCreatedAt = now;
  }
  return innertubeInstance;
}

// Simple in-memory cache for audio URLs (they last ~6 hours)
const audioUrlCache = new Map<string, { url: string; expires: number }>();

// Piped API instances (fallback for datacenter IPs where YouTube blocks streaming data)
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
  "https://api.piped.privacydevs.net",
  "https://pipedapi.darkness.services",
];

async function getAudioFromPiped(videoId: string): Promise<string | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      console.log(`[audio/${videoId}] Trying Piped instance: ${instance}`);

      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        continue;
      }

      const data = await res.json();
      const audioStreams = data.audioStreams;

      if (!audioStreams || audioStreams.length === 0) {
        continue;
      }

      // Prefer m4a/mp4 audio, then sort by bitrate
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sorted = audioStreams
        .filter((s: { mimeType?: string; url?: string }) => s.url)
        .sort(
          (
            a: { mimeType?: string; bitrate?: number },
            b: { mimeType?: string; bitrate?: number }
          ) => {
            const aIsMp4 = a.mimeType?.includes("mp4") ? 1 : 0;
            const bIsMp4 = b.mimeType?.includes("mp4") ? 1 : 0;
            if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
            return (b.bitrate ?? 0) - (a.bitrate ?? 0);
          }
        );

      if (sorted.length > 0 && sorted[0].url) {
        console.log(`[audio/${videoId}] Got audio from Piped ${instance}`);
        return sorted[0].url;
      }
    } catch (err) {
      continue;
    }
  }
  return null;
}

async function getAudioFromInvidious(videoId: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.invidious.io/instances.json", {
      next: { revalidate: 3600 } // Cache for 1 hour
    });
    if (!res.ok) return null;
    const data = await res.json();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instances = data
      .filter((i: any) => i[1]?.api === true)
      .sort((a: any, b: any) => (b[1]?.monitor?.uptime || 0) - (a[1]?.monitor?.uptime || 0))
      .map((i: any) => i[1]?.uri);

    for (const instance of instances.slice(0, 5)) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        console.log(`[audio/${videoId}] Trying Invidious instance: ${instance}`);
        const vidRes = await fetch(`${instance}/api/v1/videos/${videoId}`, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        clearTimeout(timeout);

        if (!vidRes.ok) continue;

        const vidData = await vidRes.json();
        const audioStreams = vidData.adaptiveFormats || vidData.formatStreams || [];
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sorted = audioStreams
          .filter((s: any) => s.type && (s.type.includes("audio/mp4") || s.type.includes("audio/webm")))
          .sort((a: any, b: any) => {
            const aIsMp4 = a.type.includes("mp4") ? 1 : 0;
            const bIsMp4 = b.type.includes("mp4") ? 1 : 0;
            if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
            return (b.bitrate || 0) - (a.bitrate || 0);
          });

        if (sorted.length > 0 && sorted[0].url) {
          console.log(`[audio/${videoId}] Got audio from Invidious ${instance}`);
          return sorted[0].url;
        }
      } catch (err) {
        continue;
      }
    }
  } catch (e) {
    console.error(`[audio/${videoId}] Invidious fallback failed`, e);
  }
  return null;
}

async function extractWithInnertube(
  videoId: string
): Promise<string | null> {
  try {
    const yt = await getInnertube();

    // Try clients in order of reliability
    const clients = ["WEB_EMBEDDED", "ANDROID", "IOS", "WEB", "TV_EMBEDDED"] as const;

    for (const client of clients) {
      try {
        console.log(`[audio/${videoId}] Trying Innertube client: ${client}`);
        const info = await yt.getInfo(videoId, { client });

        if (!info.streaming_data) {
          continue;
        }

        const adaptiveFormats =
          info.streaming_data.adaptive_formats ?? [];
        const audioFormats = adaptiveFormats
          .filter((f) => f.mime_type?.startsWith("audio/"))
          .sort((a, b) => {
            const aIsMp4 = a.mime_type?.includes("mp4a") ? 1 : 0;
            const bIsMp4 = b.mime_type?.includes("mp4a") ? 1 : 0;
            if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
            return (b.bitrate ?? 0) - (a.bitrate ?? 0);
          });

        if (audioFormats.length === 0) {
          continue;
        }

        console.log(
          `[audio/${videoId}] Innertube ${client} has ${audioFormats.length} audio formats, deciphering best...`
        );
        const audioUrl = await audioFormats[0].decipher(yt.session.player);

        if (audioUrl) {
          console.log(
            `[audio/${videoId}] Got audio URL from Innertube ${client}`
          );
          return audioUrl;
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.warn(
      `[audio/${videoId}] Innertube initialization failed:`,
      (e as Error).message.substring(0, 100)
    );
    innertubeInstance = null;
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  }

  // Check cache first
  const cached = audioUrlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    console.log(`[audio/${videoId}] Cache hit`);
    return NextResponse.json({ url: cached.url });
  }

  console.log(`[audio/${videoId}] Cache miss, fetching...`);

  // Try Innertube first (works on residential IPs / localhost)
  let audioUrl = await extractWithInnertube(videoId);

  // Fallback to Invidious API
  if (!audioUrl) {
    console.log(`[audio/${videoId}] Innertube failed, attempting Invidious API...`);
    audioUrl = await getAudioFromInvidious(videoId);
  }

  // Fallback to Piped API
  if (!audioUrl) {
    console.log(`[audio/${videoId}] Invidious failed, attempting Piped API...`);
    audioUrl = await getAudioFromPiped(videoId);
  }

  if (!audioUrl) {
    console.error(`[audio/${videoId}] All extraction methods failed`);
    return NextResponse.json(
      { error: "No streaming data available for this video" },
      { status: 404 }
    );
  }

  console.log(`[audio/${videoId}] Successfully extracted audio URL`);

  // Cache for 5 hours
  audioUrlCache.set(videoId, {
    url: audioUrl,
    expires: Date.now() + 5 * 60 * 60 * 1000,
  });

  // Clean old cache entries
  if (audioUrlCache.size > 200) {
    const now = Date.now();
    for (const [key, val] of audioUrlCache) {
      if (val.expires < now) audioUrlCache.delete(key);
    }
  }

  return NextResponse.json({ url: audioUrl });
}
