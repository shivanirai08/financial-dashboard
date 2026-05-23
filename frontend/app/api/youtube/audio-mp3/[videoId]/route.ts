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
    const result = await resolveMp3Link(videoId, { useCache });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve MP3 stream";
    const status = message.includes("monthly limit") ? 429 : 500;
    return NextResponse.json({ status: "error", msg: message }, { status });
  }
}
