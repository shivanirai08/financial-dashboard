import ytSearch from "yt-search";

type YtAuthor = {
  name?: string;
};

type YtVideo = {
  videoId?: string;
  title?: string;
  author?: YtAuthor;
  timestamp?: string;
  duration?: {
    seconds?: number;
  };
  image?: string;
};

type YtSearchResult = {
  videos?: YtVideo[];
};

export type YoutubeSearchItem = {
  videoId: string;
  title: string;
  artist: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  url: string;
};

export async function searchYoutubeVideos(query: string, limit = 10) {
  const searchResult = (await ytSearch(query)) as YtSearchResult;
  const videos = searchResult.videos ?? [];

  return videos
    .filter((video) => video.videoId)
    .slice(0, limit)
    .map((video) => {
      const videoId = video.videoId as string;

      return {
        videoId,
        title: video.title ?? "Unknown title",
        artist: video.author?.name ?? "Unknown artist",
        durationSeconds: video.duration?.seconds ?? null,
        thumbnailUrl: video.image ?? null,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      } satisfies YoutubeSearchItem;
    });
}

export async function searchYoutubeVideo(query: string) {
  const results = await searchYoutubeVideos(query, 1);
  const firstResult = results[0] ?? null;

  if (!firstResult) {
    return null;
  }

  return {
    videoId: firstResult.videoId,
    url: firstResult.url,
  };
}
