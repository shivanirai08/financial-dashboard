import { NextResponse } from "next/server";
import { resolveMp3Link } from "@/lib/server/mp3-cache";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const url = new URL(req.url);
    const flow = url.searchParams.get("flow");
    const useCache = flow !== "direct";
    const { videoId } = await params;

    const resolved = await resolveMp3Link(videoId, { useCache });
    const upstreamHeaders = new Headers();
    const range = req.headers.get("range");
    if (range) {
      upstreamHeaders.set("range", range);
    }

    const upstream = await fetch(resolved.link, { headers: upstreamHeaders });
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { status: "error", msg: `Upstream audio fetch failed: ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");

    headers.set("Content-Type", contentType ?? "audio/mpeg");
    headers.set("Cache-Control", "private, max-age=3600");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }
    if (contentRange) {
      headers.set("Content-Range", contentRange);
    }
    if (acceptRanges) {
      headers.set("Accept-Ranges", acceptRanges);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stream MP3";
    const status = message.includes("monthly limit") ? 429 : 500;
    return NextResponse.json({ status: "error", msg: message }, { status });
  }
}
