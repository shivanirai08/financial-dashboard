import { NextResponse } from "next/server";
import { ensureCachedMp3 } from "@/lib/server/mp3-cache";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const result = await ensureCachedMp3(videoId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve MP3 stream";
    const status = message.includes("monthly limit") ? 429 : 500;
    return NextResponse.json({ status: "error", msg: message }, { status });
  }
}
