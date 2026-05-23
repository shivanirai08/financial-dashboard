import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/sync/public": [
      "./node_modules/cheerio/**/*",
      "./node_modules/cheerio-select/**/*",
      "./node_modules/yt-search/**/*",
    ],
    "/api/spotify/public-names": [
      "./node_modules/cheerio/**/*",
      "./node_modules/cheerio-select/**/*",
      "./node_modules/yt-search/**/*",
    ],
  },
};

export default nextConfig;
