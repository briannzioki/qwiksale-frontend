export const runtime = "nodejs"; // must be node for raw body + fetch
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/** ~1MB limit to avoid abuse */
const MAX_ENVELOPE_BYTES = 1_000_000;

/** Default allow-list when SENTRY_TUNNEL_ALLOWED_HOSTS is not provided */
const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  ".ingest.sentry.io",
  ".ingest.us.sentry.io",
  ".ingest.de.sentry.io",
  ".sentry.io",
];

function corsHeaders(origin: string | null) {
  const o = origin ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, x-sentry-auth, sentry-trace, baggage",
    "Access-Control-Max-Age": "600",
  };
}

function isHostAllowed(hostname: string): boolean {
  const env = (process.env["SENTRY_TUNNEL_ALLOWED_HOSTS"] || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const list = env.length ? env : DEFAULT_ALLOWED_HOST_SUFFIXES;

  return list.some((allowed) => {
    // Support exact host or suffix (".example.com" matches "a.example.com")
    if (!allowed) return false;
    const norm = allowed.startsWith(".") ? allowed.slice(1) : allowed;
    return hostname === norm || hostname.endsWith("." + norm);
  });
}

/** Build envelope URL safely from a DSN string */
function envelopeUrlFromDsn(dsn: string): string | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, "");
    if (!/^\d+$/.test(projectId)) return null;
    if (!isHostAllowed(u.hostname)) return null;
    return `${u.protocol}//${u.host}/api/${projectId}/envelope/`;
  } catch {
    return null;
  }
}

/** Fallback: DSN from env */
function envelopeUrlFromEnv(): string | null {
  const dsn = process.env["SENTRY_DSN"] || process.env["NEXT_PUBLIC_SENTRY_DSN"] || "";
  return dsn ? envelopeUrlFromDsn(dsn) : null;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || null;

  // Allow turning the tunnel off without code changes
  if (process.env["SENTRY_TUNNEL"] === "0") {
    return new NextResponse(null, {
      status: 204,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
  }

  // Basic size guardrail
  const len = Number(req.headers.get("content-length") || "0");
  if (len && len > MAX_ENVELOPE_BYTES) {
    return new NextResponse(null, {
      status: 204,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
  }

  // Keep the raw envelope (text, not JSON)
  const body = await req.text();
  if (!body || !body.trim()) {
    return new NextResponse(null, {
      status: 204,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
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
    /* ignore parse errors */
  }
  if (!forwardUrl) forwardUrl = envelopeUrlFromEnv();
  if (!forwardUrl) {
    // No DSN → swallow silently
    return new NextResponse(null, {
      status: 204,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
  }

  try {
    const upstream = await fetch(forwardUrl, {
      method: "POST",
      body,
      headers: {
        "Content-Type":
          req.headers.get("content-type") || "application/x-sentry-envelope",
        "baggage": req.headers.get("baggage") || "",
        "sentry-trace": req.headers.get("sentry-trace") || "",
      },
      cache: "no-store",
      redirect: "manual",
    });

    // Don’t leak upstream details; 204 tells the SDK “we’re good”.
    return new NextResponse(null, {
      status: 204,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[sentry tunnel] forward failed:", e);
    }
    return new NextResponse(null, {
      status: 204,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
  }
}
