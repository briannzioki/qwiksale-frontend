// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/?source=pwa",
    name: "QwikSale",
    short_name: "QwikSale",
    description: "Buy & sell products and services. Fast, simple, safe.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#161748",
    dir: "ltr",
    lang: "en",
    categories: ["shopping", "business", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" }
    ],
    shortcuts: [
      {
        name: "Sell an item",
        short_name: "Sell",
        description: "Post a new product or service",
        url: "/sell?source=pwa-shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "Search",
        short_name: "Search",
        description: "Find products and services",
        url: "/search?source=pwa-shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "Saved",
        short_name: "Saved",
        description: "View your saved items",
        url: "/saved?source=pwa-shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      }
    ],
    prefer_related_applications: false
  };
}
