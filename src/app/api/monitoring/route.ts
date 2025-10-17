export const runtime = "nodejs"; // must be node
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/** Build envelope URL from a DSN string */
function envelopeUrlFromDsn(dsn: string): string | null {
  const m = dsn.match(/^https?:\/\/[^@]+@([^/]+)\/(\d+)$/i);
  if (!m) return null;
  const host = m[1];       // e.g. oXXXX.ingest.de.sentry.io
  const project = m[2];    // numeric project id
  return `https://${host}/api/${project}/envelope/`;
}

/** Fallback: from env DSN */
function envelopeUrlFromEnv(): string | null {
  const dsn =
    process.env["SENTRY_DSN"] ||
    process.env["NEXT_PUBLIC_SENTRY_DSN"] ||
    "";
  return envelopeUrlFromDsn(dsn);
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-sentry-auth, sentry-trace, baggage",
      "Access-Control-Max-Age": "600",
    },
  });
}

export async function POST(req: NextRequest) {
  // Keep the raw envelope (text, not JSON)
  const body = await req.text();
  if (!body || !body.trim()) {
    return new Response(null, { status: 204 });
  }

  // Prefer DSN embedded in the envelope header (matches the project the SDK used)
  let forwardUrl: string | null = null;
  try {
    const [headerLine] = body.split("\n");
    const header = JSON.parse(headerLine || "{}");
    if (header?.dsn) {
      forwardUrl = envelopeUrlFromDsn(String(header.dsn));
    }
  } catch {
    // ignore parse errors; we'll fall back to env DSN below
  }

  if (!forwardUrl) {
    forwardUrl = envelopeUrlFromEnv();
  }
  if (!forwardUrl) {
    // No DSN available → swallow silently
    return new Response(null, { status: 204 });
  }

  try {
    const res = await fetch(forwardUrl, {
      method: "POST",
      body,
      headers: {
        "Content-Type":
          req.headers.get("content-type") || "application/x-sentry-envelope",
        "baggage": req.headers.get("baggage") || "",
        "sentry-trace": req.headers.get("sentry-trace") || "",
      },
      cache: "no-store",
    });

    // Normalize to 204 for browsers regardless of Sentry’s exact 2xx code
    return new Response(null, { status: res.status < 500 ? 204 : 204 });
  } catch (e) {
    console.error("[sentry tunnel] forward failed:", e);
    return new Response(null, { status: 204 });
  }
}
