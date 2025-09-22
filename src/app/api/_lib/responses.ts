// src/app/api/_lib/responses.ts
import { NextResponse } from "next/server";

/** Publicly cacheable JSON (good for read-only endpoints, no user personalization). */
export function jsonPublic(
  data: any,
  seconds = 60,
  init?: ResponseInit & { vary?: string[] }
): NextResponse {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", `s-maxage=${seconds}, stale-while-revalidate=${Math.max(seconds * 5, seconds)}`);
  // Minimal Vary to keep CDN happy; do NOT vary on Cookie for public
  const vary = new Set(["Accept-Encoding", ...(init?.vary ?? [])]);
  res.headers.set("Vary", Array.from(vary).join(", "));
  return res;
}

/** Per-user/private JSON (personalized; never cache at the CDN). */
export function jsonPrivate(
  data: any,
  init?: ResponseInit & { vary?: string[] }
): NextResponse {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const vary = new Set(["Cookie", "Authorization", "Accept-Encoding", ...(init?.vary ?? [])]);
  res.headers.set("Vary", Array.from(vary).join(", "));
  return res;
}

/** Low-level helper if you already built a Response/NextResponse. */
export function noStore(jsonOrRes: unknown, init?: ResponseInit): NextResponse {
  const res =
    jsonOrRes instanceof NextResponse
      ? jsonOrRes
      : NextResponse.json(jsonOrRes as any, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const prevVary = res.headers.get("Vary");
  const vary = new Set(["Cookie", "Authorization", "Accept-Encoding", ...(prevVary ? prevVary.split(/\s*,\s*/) : [])]);
  res.headers.set("Vary", Array.from(vary).join(", "));
  return res;
}
