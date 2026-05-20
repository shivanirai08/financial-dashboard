import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulsebox",
    short_name: "Pulsebox",
    description:
      "Import Spotify playlists, match tracks to YouTube, and play your library in an installable web app.",
    start_url: "/",
    display: "standalone",
    categories: ["music", "entertainment"],
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
