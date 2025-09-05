// src/app/lib/analytics.ts
import posthog from "posthog-js";

export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (posthog.__loaded) return;
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
  } as any);
}

export function track(name: string, props?: Record<string, any>) {
  if (typeof window !== "undefined" && (posthog as any)?._isFeatureEnabled !== undefined) {
    posthog.capture(name, props);
  }
}
