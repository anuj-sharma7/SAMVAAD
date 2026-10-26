import type { MetadataRoute } from "next";

/** Web app manifest: makes SAMVAAD installable. The app opens in field mode, the part that works without internet. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/field",
    name: "SAMVAAD · mentoring copilot",
    short_name: "SAMVAAD",
    description: "Record school visits, observations and agreed next steps, even without internet. Prototype with fictional demo data.",
    start_url: "/field?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf8f5",
    theme_color: "#0f1b33",
    lang: "en",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Start a visit", short_name: "New visit", url: "/field#/visits/new" }],
  };
}
