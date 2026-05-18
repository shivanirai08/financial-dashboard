import { NextRequest, NextResponse } from "next/server";
import { searchYoutubeVideos } from "@/lib/youtube";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? "10") || 10, 25);

    if (!query) {
      return NextResponse.json({ error: "Query parameter 'q' is required." }, { status: 400 });
    }

    const collection = await searchYoutubeVideos(query, limit);
    return NextResponse.json({ collection });
  } catch (error) {
    console.error("[api/youtube/search] failed", error);
    return NextResponse.json(
      { error: "YouTube search is temporarily unavailable." },
      { status: 502 }
    );
  }
}
