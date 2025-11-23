// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/?source=pwa",
    name: "QwikSale",
    short_name: "QwikSale",
    // Match the new marketing copy, no dashes
    description:
      "QwikSale is Kenya’s trusted marketplace for all items. Buy and sell products and services with free listings, clear photos and direct WhatsApp or call enquiries.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#161748",
    dir: "ltr",
    lang: "en-KE",
    categories: ["shopping", "business", "utilities"],
    // Point at the same favicon set you’re using elsewhere
    icons: [
      {
        src: "/favicon/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Sell an item",
        short_name: "Sell",
        description: "Post a new product or service",
        url: "/sell?source=pwa-shortcut",
        icons: [
          {
            src: "/favicon/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "Search",
        short_name: "Search",
        description: "Find products and services",
        url: "/search?source=pwa-shortcut",
        icons: [
          {
            src: "/favicon/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "Saved",
        short_name: "Saved",
        description: "View your saved items",
        url: "/saved?source=pwa-shortcut",
        icons: [
          {
            src: "/favicon/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
    prefer_related_applications: false,
  };
}
