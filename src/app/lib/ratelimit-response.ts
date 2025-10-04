// src/app/lib/ratelimit-response.ts
import { NextResponse } from "next/server";

export function tooMany(message: string, retryAfterSec: number) {
  const res = NextResponse.json({ error: message }, { status: 429 });
  res.headers.set("Retry-After", String(Math.max(1, Math.floor(retryAfterSec || 1))));
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return res;
}
