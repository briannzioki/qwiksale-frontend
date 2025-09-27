// src/app/monitoring/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Build an envelope URL from a Sentry DSN.
 * DSN format: https://<publicKey>@o<org>.ingest.sentry.io/<projectId>
 * Envelope:   https://o<org>.ingest.sentry.io/api/<projectId>/envelope/
 */
function envelopeUrlFromDsn(dsn: string | undefined | null): string | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
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

/** Resolve a CORS origin (lock to your site in prod if available). */
function allowedOrigin(): string {
  const base =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "";
  try {
    if (base) return new URL(base).origin;
  } catch {
    /* ignore invalid */
  }
  return "*";
}

/** Basic CORS headers so the browser can POST directly to this route. */
function corsHeaders() {
  const origin = allowedOrigin();
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Sentry-Auth, Origin, Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  } as const;
}

function json(
  body: unknown,
  init?: ResponseInit & { noStore?: boolean }
): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...(init?.noStore ? { "Cache-Control": "no-store" } : null),
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  const forwardUrl = resolveEnvelopeUrl();
  return json(
    {
      ok: !!forwardUrl,
      forwardUrl: forwardUrl ? "[configured]" : null,
      runtime: "edge",
    },
    { status: forwardUrl ? 200 : 500, noStore: true }
  );
}

export async function POST(req: Request) {
  const forwardUrl = resolveEnvelopeUrl();
  if (!forwardUrl) {
    return json(
      {
        ok: false,
        error:
          "Sentry not configured. Set SENTRY_ENVELOPE_URL or SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN.",
      },
      { status: 500, noStore: true }
    );
  }

  let bodyText = "";
  try {
    bodyText = await req.text();
    if (!bodyText) {
      return json({ ok: false, error: "Empty envelope payload" }, {
        status: 400,
        noStore: true,
      });
    }
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Read error" }, {
      status: 400,
      noStore: true,
    });
  }

  try {
    const res = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
      },
      body: bodyText,
      cache: "no-store",
    });

    return new NextResponse(null, {
      status: res.status,
      headers: {
        ...corsHeaders(),
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: e?.message || "Forward error",
      },
      { status: 502, noStore: true }
    );
  }
}

