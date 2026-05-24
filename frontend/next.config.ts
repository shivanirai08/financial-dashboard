import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/sync/public": [
      "./node_modules/cheerio/**",
      "./node_modules/cheerio-select/**",
      "./node_modules/domutils/**",
      "./node_modules/domhandler/**",
      "./node_modules/dom-serializer/**",
      "./node_modules/htmlparser2/**",
      "./node_modules/parse5/**",
      "./node_modules/parse5-htmlparser2-tree-adapter/**",
      "./node_modules/parse5-parser-stream/**",
      "./node_modules/undici/**",
      "./node_modules/whatwg-mimetype/**",
      "./node_modules/encoding-sniffer/**",
      "./node_modules/yt-search/**",
    ],
    "/api/spotify/public-names": [
      "./node_modules/cheerio/**",
      "./node_modules/cheerio-select/**",
      "./node_modules/domutils/**",
      "./node_modules/domhandler/**",
      "./node_modules/dom-serializer/**",
      "./node_modules/htmlparser2/**",
      "./node_modules/parse5/**",
      "./node_modules/parse5-htmlparser2-tree-adapter/**",
      "./node_modules/parse5-parser-stream/**",
      "./node_modules/undici/**",
      "./node_modules/whatwg-mimetype/**",
      "./node_modules/encoding-sniffer/**",
      "./node_modules/yt-search/**",
    ],
  },
};

export default nextConfig;
