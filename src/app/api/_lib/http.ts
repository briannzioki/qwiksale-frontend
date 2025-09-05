import { NextResponse } from "next/server";

export function json<T>(body: T, init: ResponseInit = {}) {
  return new NextResponse(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}

export function noStore<T>(body: T, init: ResponseInit = {}) {
  return json(body, { ...init, headers: { "cache-control": "no-store", ...(init.headers || {}) } });
}

export function err(status: number, message: string, more?: Record<string, unknown>) {
  return noStore({ ok: false, error: message, ...more }, { status });
}
