import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrackRecord",
    short_name: "TrackRecord",
    description: "Tamper-evident performance records for Kenyan para-athletes.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b5d3b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
