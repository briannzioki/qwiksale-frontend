// src/app/api/_lib/request.ts
import { headers } from "next/headers";

// Minimal type definition (matches Next.js ReadonlyHeaders shape)
type ReadonlyHeaders = {
  get(name: string): string | null;
  has(name: string): boolean;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  entries(): IterableIterator<[string, string]>;
  forEach(
    callbackfn: (value: string, key: string, parent: ReadonlyHeaders) => void,
    thisArg?: any
  ): void;
  [Symbol.iterator](): IterableIterator<[string, string]>;
};

// Normalize headers() which can be sync or async
async function getReqHeaders(): Promise<ReadonlyHeaders> {
  const h = headers() as unknown;
  return (h && typeof (h as any).then === "function")
    ? ((await h) as ReadonlyHeaders)
    : (h as ReadonlyHeaders);
}

export async function clientIp(): Promise<string> {
  const h = await getReqHeaders();
  const xf = h.get("x-forwarded-for") || "";
  const ip =
    xf.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "127.0.0.1";
  return ip;
}

export async function clientKey(prefix: string): Promise<string> {
  const ip = await clientIp();
  const userId = "anon"; // replace with session.user.id later
  return `${prefix}:${userId}:${ip}`;
}

export async function userAgent(): Promise<string | null> {
  const h = await getReqHeaders();
  return h.get("user-agent");
}

export async function requestOrigin(): Promise<string | null> {
  const h = await getReqHeaders();
  return h.get("origin");
}
