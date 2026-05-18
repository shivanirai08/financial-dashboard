import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/yt-search/**/*",
      "./node_modules/cheerio/**/*",
      "./node_modules/cheerio-select/**/*",
    ],
  },
};

export default nextConfig;
