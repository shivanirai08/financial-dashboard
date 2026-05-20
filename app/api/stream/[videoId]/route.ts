import { NextRequest, NextResponse } from "next/server";
import { Innertube } from "youtubei.js";

export const runtime = "nodejs";
export const maxDuration = 30;

const SOURCE_TIMEOUT_MS = 3500;

// Cache Innertube instance
let innertubeInstance: Awaited<ReturnType<typeof Innertube.create>> | null = null;
let instanceCreatedAt = 0;
const INSTANCE_TTL = 30 * 60 * 1000;

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

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
  "https://api.piped.privacydevs.net",
  "https://pipedapi.darkness.services",
];

async function getAudioUrl(videoId: string): Promise<string | null> {
  // Try Innertube first
  try {
    const yt = await getInnertube();
    const clients = ["WEB_EMBEDDED", "ANDROID", "IOS", "WEB", "TV_EMBEDDED"] as const;

    for (const client of clients) {
      try {
        console.log(`[stream/${videoId}] Innertube: ${client}`);
        const info = await yt.getInfo(videoId, { client });
        if (!info.streaming_data?.adaptive_formats) continue;

        const audioFormats = info.streaming_data.adaptive_formats
          .filter((f) => f.mime_type?.startsWith("audio/"))
          .sort((a, b) => {
            const aIsMp4 = a.mime_type?.includes("mp4a") ? 1 : 0;
            const bIsMp4 = b.mime_type?.includes("mp4a") ? 1 : 0;
            return bIsMp4 - aIsMp4 || (b.bitrate ?? 0) - (a.bitrate ?? 0);
          });

        if (audioFormats.length > 0) {
          const url = await audioFormats[0].decipher(yt.session.player);
          if (url) {
            console.log(`[stream/${videoId}] ✓ Got URL from Innertube ${client}`);
            return url;
          }
        }
      } catch {
        continue;
      }
    }
  } catch (e) {
    console.warn(`[stream/${videoId}] Innertube failed:`, (e as Error).message?.substring(0, 80));
    innertubeInstance = null;
  }

  // Fallback: Piped
  for (const instance of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
      console.log(`[stream/${videoId}] Piped: ${instance}`);

      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const data = (await res.json()) as { audioStreams?: Array<{ url?: string; mimeType?: string; bitrate?: number }> };
      const audioStreams = data.audioStreams?.filter((s) => s.url).sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

      if (audioStreams?.[0]?.url) {
        console.log(`[stream/${videoId}] ✓ Got URL from Piped ${instance}`);
        return audioStreams[0].url;
      }
    } catch {
      continue;
    }
  }

  console.error(`[stream/${videoId}] All sources exhausted`);
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

  try {
    const audioUrl = await getAudioUrl(videoId);
    if (!audioUrl) {
      return NextResponse.json({ error: "No audio available" }, { status: 404 });
    }

    // Fetch the audio from the source and stream it back
    const audioRes = await fetch(audioUrl, {
      headers: {
        "Range": request.headers.get("Range") || "",
        "User-Agent": "Mozilla/5.0",
      },
      // Don't buffer entire response
    });

    if (!audioRes.ok) {
      return NextResponse.json({ error: "Failed to fetch audio" }, { status: 502 });
    }

    // Stream audio directly with proper headers
    const headers = new Headers();
    headers.set("Content-Type", audioRes.headers.get("Content-Type") || "audio/mpeg");
    headers.set("Accept-Ranges", "bytes");
    
    const contentLength = audioRes.headers.get("Content-Length");
    if (contentLength) headers.set("Content-Length", contentLength);
    
    const contentRange = audioRes.headers.get("Content-Range");
    if (contentRange) headers.set("Content-Range", contentRange);

    // Cache for 1 hour (persistent stream endpoint, not the expiring source URL)
    headers.set("Cache-Control", "public, max-age=3600");

    return new NextResponse(audioRes.body, {
      status: audioRes.status,
      statusText: audioRes.statusText,
      headers,
    });
  } catch (error) {
    console.error(`[stream/${videoId}] Error:`, (error as Error).message?.substring(0, 100));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
