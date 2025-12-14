// src/app/api/services/[id]/contact/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

/* ------------------------- tiny helpers ------------------------- */
function setNoStoreHeaders(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return res;
}

function noStore(json: unknown, init?: ResponseInit) {
  return setNoStoreHeaders(NextResponse.json(json, init));
}

function shouldLog() {
  return process.env.NODE_ENV !== "production";
}

function getId(req: NextRequest): string {
  try {
    const segs = req.nextUrl.pathname.split("/");
    const i = segs.findIndex((s) => s === "services");
    const id = i >= 0 ? (segs[i + 1] ?? "") : "";
    return (id ?? "").toString().trim();
  } catch {
    return "";
  }
}

function getClientIp(req: NextRequest): string | null {
  const xf =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-vercel-forwarded-for") ||
    "";
  if (xf) return xf.split(",")[0]?.trim() || null;
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return null;
}

function hasAuthSessionCookie(req: NextRequest) {
  // Auth.js / NextAuth common cookie names (http/https)
  const c = req.cookies;
  return Boolean(
    c.get("__Secure-authjs.session-token") ||
      c.get("authjs.session-token") ||
      c.get("__Secure-next-auth.session-token") ||
      c.get("next-auth.session-token")
  );
}

async function safeCount(p: Promise<number>, label: string): Promise<number> {
  try {
    return await p;
  } catch (e) {
    if (shouldLog()) {
      // eslint-disable-next-line no-console
      console.warn(`[services/:id/contact] ${label} failed:`, e);
    }
    return -1;
  }
}

/* ------------------------------- GET ------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const serviceId = getId(req);
    if (!serviceId) return noStore({ error: "Missing id" }, { status: 400 });

    const ip = getClientIp(req);
    const uaRaw = req.headers.get("user-agent") || "";
    const ua = uaRaw ? uaRaw.slice(0, 240) : null;

    // viewer is optional (guests allowed) — avoid auth() work unless a session is plausible
    let viewerUserId: string | undefined;
    const hasAuthHeader = Boolean(req.headers.get("authorization"));
    if (hasAuthHeader || hasAuthSessionCookie(req)) {
      const session = await auth().catch(() => null);
      viewerUserId = (session as any)?.user?.id as string | undefined;
    }

    // Global best-effort rate limit (bucket per viewer/ip + service)
    const viewerKey = viewerUserId ?? ip ?? "anon";
    const rl =
      (await checkRateLimit(req.headers, {
        name: "services_contact_reveal",
        limit: 5,
        windowMs: 60_000,
        extraKey: `${viewerKey}:${serviceId}`,
      }).catch((e: unknown) => {
        if (shouldLog()) {
          // eslint-disable-next-line no-console
          console.warn("[services/:id/contact] rate-limit error:", e);
        }
        return { ok: true, retryAfterSec: 0 };
      })) as { ok: boolean; retryAfterSec?: number };

    if (!rl.ok) {
      const retryAfterSec = typeof rl.retryAfterSec === "number" ? rl.retryAfterSec : 60;
      const res = tooMany("Please wait a moment before revealing more contacts.", retryAfterSec);
      res.headers.set("Retry-After", String(retryAfterSec));
      return setNoStoreHeaders(res);
    }

    // Minimal public fields (single query)
    const svc = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        name: true,
        sellerName: true,
        sellerPhone: true,
        sellerLocation: true,
      },
    });
    if (!svc) return noStore({ error: "Not found" }, { status: 404 });

    // ---- Soft throttle windows (DB-backed) ----
    // Keep this heavy path primarily for guests (scrape control).
    const applyDbThrottle = Boolean(ip) && !viewerUserId;

    if (applyDbThrottle) {
      const now = Date.now();
      const WIN_IP_HR = new Date(now - 60 * 60 * 1000); // 1 hour
      const WIN_DEVICE_15 = new Date(now - 15 * 60 * 1000); // 15 minutes

      const MAX_PER_IP_PER_HOUR = 12;
      const MAX_PER_DEVICE_15MIN = 6;

      const [ipCountRaw, devCountRaw] = await Promise.all([
        safeCount(
          prisma.serviceContactReveal.count({
            where: {
              serviceId,
              ip: ip!,
              createdAt: { gte: WIN_IP_HR },
            },
          }),
          "serviceContactReveal.count(ip)"
        ),
        ua
          ? safeCount(
              prisma.serviceContactReveal.count({
                where: {
                  serviceId,
                  ip: ip!,
                  userAgent: ua,
                  createdAt: { gte: WIN_DEVICE_15 },
                },
              }),
              "serviceContactReveal.count(device)"
            )
          : Promise.resolve(0),
      ]);

      const ipCount = ipCountRaw < 0 ? 0 : ipCountRaw;
      const devCount = devCountRaw < 0 ? 0 : devCountRaw;

      if (ipCount >= MAX_PER_IP_PER_HOUR) {
        const res = noStore({ error: "Too many requests. Please try again later." }, { status: 429 });
        res.headers.set("Retry-After", "1800"); // 30 min
        return res;
      }

      if (ua && devCount >= MAX_PER_DEVICE_15MIN) {
        const res = noStore({ error: "Please wait a few minutes before trying again." }, { status: 429 });
        res.headers.set("Retry-After", "300"); // 5 min
        return res;
      }
    }

    // Light telemetry — never block user on errors (fire-and-forget)
    if (ip || viewerUserId) {
      void (async () => {
        try {
          await prisma.serviceContactReveal.createMany({
            data: [
              {
                serviceId,
                viewerUserId: viewerUserId ?? null,
                ip: ip ?? null,
                userAgent: ua,
              },
            ],
            // If you have a unique constraint (e.g. serviceId+viewerUserId), this avoids noisy errors.
            skipDuplicates: true,
          });
        } catch (e) {
          if (shouldLog()) {
            // eslint-disable-next-line no-console
            console.warn("[services/:id/contact] serviceContactReveal.createMany failed:", e);
          }
        }
      })();
    }

    // Shape contact payload
    const contact = {
      name: svc.sellerName || "Provider",
      phone: svc.sellerPhone || null,
      location: svc.sellerLocation || null,
    };

    return noStore({
      service: { id: svc.id, name: svc.name },
      contact,
      suggestLogin: !viewerUserId,
    });
  } catch (e) {
    if (shouldLog()) {
      // eslint-disable-next-line no-console
      console.warn("[services/:id/contact GET] error:", e);
    }
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------- CORS (optional) ----------------------------- */
export function OPTIONS() {
  const origin = process.env["NEXT_PUBLIC_APP_ORIGIN"] ?? process.env["NEXT_PUBLIC_APP_URL"] ?? "*";

  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
