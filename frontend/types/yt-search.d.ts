declare module 'yt-search' {
  interface YtAuthor {
    name?: string;
  }

  interface YtDuration {
    seconds?: number;
  }

  interface YtVideo {
    videoId?: string;
    title?: string;
    author?: YtAuthor;
    timestamp?: string;
    duration?: YtDuration;
    image?: string;
  }

  interface YtSearchResult {
    videos?: YtVideo[];
  }

  function ytSearch(query: string): Promise<YtSearchResult>;

  export default ytSearch;
}
