import { NextRequest, NextResponse } from "next/server";
import { Innertube } from "youtubei.js";

export const runtime = "nodejs";

// Cache Innertube instance (expensive to create)
let innertubeInstance: Awaited<ReturnType<typeof Innertube.create>> | null = null;
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
    return NextResponse.json({ url: cached.url });
  }

  try {
    const yt = await getInnertube();
    const info = await yt.getBasicInfo(videoId);

    // Get adaptive formats and find best audio-only stream
    const streamingData = info.streaming_data;
    if (!streamingData) {
      return NextResponse.json(
        { error: "No streaming data available for this video" },
        { status: 404 }
      );
    }

    const adaptiveFormats = streamingData.adaptive_formats ?? [];

    // Prefer audio formats: itag 140 (m4a 128kbps) or 251 (opus 160kbps)
    // Sort: prefer m4a (wider compat) > opus, then by bitrate descending
    const audioFormats = adaptiveFormats
      .filter((f) => f.mime_type?.startsWith("audio/"))
      .sort((a, b) => {
        // Prefer mp4a (m4a) over webm/opus for broader device compatibility
        const aIsMp4 = a.mime_type?.includes("mp4a") ? 1 : 0;
        const bIsMp4 = b.mime_type?.includes("mp4a") ? 1 : 0;
        if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
        // Then by bitrate
        return (b.bitrate ?? 0) - (a.bitrate ?? 0);
      });

    if (audioFormats.length === 0) {
      return NextResponse.json(
        { error: "No audio formats available" },
        { status: 404 }
      );
    }

    const bestAudio = audioFormats[0];
    const audioUrl = await bestAudio.decipher(yt.session.player);

    if (!audioUrl) {
      return NextResponse.json(
        { error: "Could not decipher audio URL" },
        { status: 500 }
      );
    }

    // Cache for 5 hours (URLs are valid for ~6 hours)
    audioUrlCache.set(videoId, {
      url: audioUrl,
      expires: Date.now() + 5 * 60 * 60 * 1000,
    });

    // Clean old cache entries periodically
    if (audioUrlCache.size > 200) {
      const now = Date.now();
      for (const [key, val] of audioUrlCache) {
        if (val.expires < now) audioUrlCache.delete(key);
      }
    }

    return NextResponse.json({ url: audioUrl });
  } catch (error) {
    console.error(`[api/youtube/audio/${videoId}] Error:`, error);

    // If instance is stale, reset it
    innertubeInstance = null;

    return NextResponse.json(
      { error: "Failed to extract audio stream" },
      { status: 500 }
    );
  }
}
