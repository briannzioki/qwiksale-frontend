// src/app/lib/ratelimit-response.ts
import { NextResponse } from "next/server";

export function tooMany(message: string, retryAfterSec: number) {
  const res = NextResponse.json({ error: message }, { status: 429 });
  res.headers.set("Retry-After", String(retryAfterSec));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
