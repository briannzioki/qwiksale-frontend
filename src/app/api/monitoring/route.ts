// Sentry tunnel route
// - Accepts POSTed envelopes from the browser and forwards them to Sentry
// - Keeps responses opaque (204), so SDKs treat it as success
// - Works only on Node.js runtime (needs raw body + Buffer)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/** ~1MB cap to avoid abuse (configurable via env) */
const MAX_ENVELOPE_BYTES = Number(process.env["SENTRY_TUNNEL_MAX_BYTES"] ?? 1_000_000);

/** Optional in-memory rate limiting (defaults are modest) */
const RL_WINDOW_MS = Number(process.env["SENTRY_TUNNEL_WINDOW_MS"] ?? 10_000);
const RL_LIMIT = Number(process.env["SENTRY_TUNNEL_LIMIT"] ?? 60);

/** Default allow-list when SENTRY_TUNNEL_ALLOWED_HOSTS is not provided */
const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  ".ingest.sentry.io",
  ".ingest.us.sentry.io",
  ".ingest.de.sentry.io",
  ".sentry.io",
];

/** Conservative CORS: echo origin (or *) and mark as non-cacheable */
function corsHeaders(origin: string | null) {
  const o = origin ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-sentry-auth, sentry-trace, baggage",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  };
}

/** Check Sentry host via env allow-list or defaults */
function isHostAllowed(hostname: string): boolean {
  const env = (process.env["SENTRY_TUNNEL_ALLOWED_HOSTS"] || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const list = env.length ? env : DEFAULT_ALLOWED_HOST_SUFFIXES;

  return list.some((allowed) => {
    if (!allowed) return false;
    const norm = allowed.startsWith(".") ? allowed.slice(1) : allowed;
    return hostname === norm || hostname.endsWith("." + norm);
  });
}

/** Build envelope URL safely from a DSN string */
function envelopeUrlFromDsn(dsn: string): string | null {
  try {
    const u = new URL(dsn);

    // Only allow https in production. In dev, http is tolerated for local tests.
    const isDev = process.env.NODE_ENV !== "production";
    if (u.protocol !== "https:" && !(isDev && u.protocol === "http:")) return null;

    if (!isHostAllowed(u.hostname)) return null;

    const projectId = u.pathname.replace(/^\/+/, "");
    if (!/^\d+$/.test(projectId)) return null;

    return `${u.protocol}//${u.host}/api/${projectId}/envelope/`;
  } catch {
    return null;
  }
}

/** Fallback to env DSN if not present in the envelope header */
function envelopeUrlFromEnv(): string | null {
  const dsn = process.env["SENTRY_DSN"] || process.env["NEXT_PUBLIC_SENTRY_DSN"] || "";
  return dsn ? envelopeUrlFromDsn(dsn) : null;
}

/** Tiny in-memory RL keyed by IP+UA to dampen bursts */
type StampStore = Map<string, number[]>;
const g = globalThis as unknown as { __SENTRY_TUNNEL_RL__?: StampStore };
const RL_STORE: StampStore = g.__SENTRY_TUNNEL_RL__ ?? new Map();
if (!g.__SENTRY_TUNNEL_RL__) g.__SENTRY_TUNNEL_RL__ = RL_STORE;

function rlKeyFromReq(req: NextRequest) {
  const ip =
    // Next/Vercel style
    (req as any).ip ??
    req.headers.get("x-forwarded-for")?.split(",")?.[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    "0.0.0.0";
  const ua = req.headers.get("user-agent") || "ua";
  return `${ip}::${ua}`;
}

function rateLimited(req: NextRequest) {
  if (RL_LIMIT <= 0) return null; // disabled
  const key = rlKeyFromReq(req);
  const now = Date.now();
  const cutoff = now - RL_WINDOW_MS;

  const arr = RL_STORE.get(key) ?? [];

  // Drain stale stamps; TS-safe access to arr[0]
  while (arr.length > 0 && arr[0]! <= cutoff) arr.shift();

  if (arr.length >= RL_LIMIT) {
    const oldest = arr.length > 0 ? arr[0]! : now;
    const retryMs = Math.max(1000, RL_WINDOW_MS - (now - oldest));
    const retrySec = Math.ceil(retryMs / 1000);
    const headers = {
      "Retry-After": String(retrySec),
      "X-RateLimit-Limit": String(RL_LIMIT),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Policy": `${RL_LIMIT};w=${Math.round(RL_WINDOW_MS / 1000)}`,
    };
    return headers;
  }

  arr.push(now);
  RL_STORE.set(key, arr);
  return null;
}

/** OPTIONS for CORS preflight */
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/** Optional HEAD handler so `curl -I` doesn’t 405 */
export async function HEAD(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/** POST: accept envelope and forward to Sentry */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || null;

  // Feature kill-switch without code changes
  if (process.env["SENTRY_TUNNEL"] === "0") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Soft rate limit (if enabled)
  const rl = rateLimited(req);
  if (rl) {
    return new NextResponse(null, {
      status: 204,
      headers: { ...corsHeaders(origin), ...rl },
    });
  }

  // Basic declared-size guard (may be absent with chunked encoding)
  const declaredLen = Number(req.headers.get("content-length") || "0");
  if (declaredLen && declaredLen > MAX_ENVELOPE_BYTES) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Keep the raw envelope (text, not JSON)
  let body = "";
  try {
    body = await req.text();
  } catch {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (!body || !body.trim()) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Byte-accurate size guard (post-read)
  try {
    const bytes = Buffer.byteLength(body, "utf8");
    if (bytes > MAX_ENVELOPE_BYTES) {
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
    }
  } catch {
    // If Buffer fails for some reason, still avoid leaking details
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Try DSN from envelope header (first line), else fallback to env
  let forwardUrl: string | null = null;
  try {
    const firstLineEnd = body.indexOf("\n");
    const headerLine = firstLineEnd >= 0 ? body.slice(0, firstLineEnd) : body;
    const header = JSON.parse(headerLine || "{}");
    if (typeof header?.dsn === "string") {
      forwardUrl = envelopeUrlFromDsn(header.dsn);
    }
  } catch {
    // ignore parse errors
  }
  if (!forwardUrl) forwardUrl = envelopeUrlFromEnv();

  // No DSN / not allowed host → swallow silently
  if (!forwardUrl) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Forward to Sentry with a short timeout and opaque response
  const timeoutMs = Number(process.env["SENTRY_TUNNEL_TIMEOUT_MS"] ?? 5000);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    await fetch(forwardUrl, {
      method: "POST",
      body,
      headers: {
        "Content-Type": req.headers.get("content-type") || "application/x-sentry-envelope",
        baggage: req.headers.get("baggage") || "",
        "sentry-trace": req.headers.get("sentry-trace") || "",
        "user-agent": "sentry-tunnel/nextjs",
      },
      cache: "no-store",
      redirect: "manual",
      signal: ctrl.signal,
      // ts-expect-error: keepalive is not in the TS dom lib for node fetch yet
      keepalive: true,
    });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[sentry tunnel] forward failed:", e);
    }
    // Regardless of error, respond 204 to avoid leaking details
  } finally {
    clearTimeout(t);
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
