// src/app/monitering/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Build an envelope URL from a Sentry DSN.
 * DSN format: https://<publicKey>@o<org>.ingest.sentry.io/<projectId>
 * Envelope:   https://o<org>.ingest.sentry.io/api/<projectId>/envelope/
 */
function envelopeUrlFromDsn(dsn: string | undefined | null): string | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    // host: oXXXXXX.ingest.sentry.io
    // pathname: /<projectId>
    const projectId = u.pathname.replace(/^\/+/, "");
    if (!projectId) return null;

    // Normalize host: support .ingest. and legacy .sentry.
    const host = u.host
      .replace(/\.ingest\.sentry\.io$/, ".ingest.sentry.io")
      .replace(/\.sentry\.io$/, ".ingest.sentry.io");

    return `https://${host}/api/${projectId}/envelope/`;
  } catch {
    return null;
  }
}

/** Allow overriding the forward URL directly (handy for self-hosted Sentry/Relay). */
function resolveEnvelopeUrl(): string | null {
  const direct = process.env["SENTRY_ENVELOPE_URL"];
  if (direct) return direct;
  const dsn =
    process.env["SENTRY_DSN"] ||
    process.env["NEXT_PUBLIC_SENTRY_DSN"] ||
    process.env["NEXT_PUBLIC_SENTRY_BROWSER_DSN"];
  return envelopeUrlFromDsn(dsn);
}

/** Basic CORS headers so the browser can POST directly to this route. */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*", // lock this down to your domain if you prefer
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Sentry-Auth, Origin, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function POST(req: Request) {
  const forwardUrl = resolveEnvelopeUrl();
  if (!forwardUrl) {
    return new NextResponse(
      JSON.stringify({
        ok: false,
        error:
          "Sentry not configured. Set SENTRY_ENVELOPE_URL or SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN).",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      }
    );
  }

  // Sentry envelopes arrive as "application/x-sentry-envelope"
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/x-sentry-envelope")) {
    // Be tolerant: some SDKs may omit the header, but nudge for correctness.
    // We won't reject strictly—just forward.
  }

  // Pass through the envelope body unchanged
  let bodyText = "";
  try {
    // Edge runtime supports .text() and stream forwarding, but we need the
    // string form for a single forward.
    bodyText = await req.text();
    if (!bodyText) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Empty envelope payload" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        }
      );
    }
  } catch (e: any) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: e?.message || "Read error" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      }
    );
  }

  // Forward to Sentry
  try {
    const res = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        // DSN’s publicKey is embedded inside the envelope, so no Authorization header needed.
        "Content-Type": "application/x-sentry-envelope",
      },
      body: bodyText,
      // Avoid Next cache layers
      cache: "no-store",
    });

    // Mirror Sentry status (usually 200 or 202). Respond empty for minimum overhead.
    return new NextResponse(null, {
      status: res.status,
      headers: corsHeaders(),
    });
  } catch (e: any) {
    return new NextResponse(
      JSON.stringify({
        ok: false,
        error: e?.message || "Forward error",
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      }
    );
  }
}

/**
 * (Optional) Basic GET health-check:
 * You can `fetch('/monitering', { method: 'GET' })` to verify config at runtime.
 */
export async function GET() {
  const forwardUrl = resolveEnvelopeUrl();
  return new NextResponse(
    JSON.stringify({
      ok: !!forwardUrl,
      forwardUrl: forwardUrl ? "[configured]" : null,
      runtime: "edge",
    }),
    {
      status: forwardUrl ? 200 : 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    }
  );
}
