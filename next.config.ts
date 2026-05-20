import type { NextConfig } from "next";
import createPWA from "@ducanh2912/next-pwa";

const withPWA = createPWA({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/yt-search/**/*",
      "./node_modules/cheerio/**/*",
      "./node_modules/cheerio-select/**/*",
    ],
  },
};

export default withPWA(nextConfig);
