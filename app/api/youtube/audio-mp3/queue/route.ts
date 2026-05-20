import { NextResponse } from "next/server";
import { prefetchQueueMp3 } from "@/lib/server/mp3-cache";

type QueueRequestBody = {
  videoIds?: string[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as QueueRequestBody;
    const videoIds = Array.isArray(body.videoIds) ? body.videoIds : [];

    if (videoIds.length === 0) {
      return NextResponse.json(
        { status: "error", msg: "videoIds must be a non-empty array" },
        { status: 400 }
      );
    }

    const result = await prefetchQueueMp3(videoIds);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Queue prefetch failed";
    return NextResponse.json({ status: "error", msg: message }, { status: 500 });
  }
}
