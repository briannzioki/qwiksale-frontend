// src/app/api/cron/weekly-digest/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/* ----------------------------- helpers ----------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}
function ok<T extends object>(data: T, init?: ResponseInit) {
  return noStore({ ok: true, ...data }, init);
}
function hasValidDbUrl(): boolean {
  const u = process.env["DATABASE_URL"] ?? "";
  return /^postgres(ql)?:\/\//i.test(u);
}
function baseUrl(): string {
  const raw =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    "https://qwiksale.sale";
  return String(raw).trim().replace(/\/+$/, "");
}
function checkCronSecret(req: NextRequest): boolean {
  const qs = new URL(req.url).searchParams;
  const header = req.headers.get("x-cron-secret") || req.headers.get("authorization") || "";
  const token = qs.get("secret") || header.replace(/^Bearer\s+/i, "").trim() || "";
  const expected =
    process.env["CRON_SECRET"] ||
    process.env["CRON_TOKEN"] ||
    process.env["CRONJOB_SECRET"] ||
    "";
  return !!expected && token === expected;
}

/* ----------------------------- types ----------------------------- */
type MailerFn = (to: string, subject: string, html: string) => Promise<void>;
type SellerIdRow = { sellerId: string | null };
type ProductSlim = { id: string; sellerId: string; createdAt: Date };
type UserSlim = { id: string; email: string | null; name: string | null; username: string | null };

/** Resolve a mailer from either `@/server/email` or `@/app/lib/mailer`. */
async function resolveMailer(): Promise<MailerFn | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m1 = require("@/server/email") as { sendMail?: MailerFn };
    const fn1 = m1?.sendMail;
    if (typeof fn1 === "function") return fn1.bind(m1);
  } catch { /* ignore */ }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m2 = require("@/app/lib/mailer") as {
      sendMail?: MailerFn;
      sendWeeklyDigest?: (args: {
        to: string;
        name?: string | null;
        weeklyCount: number;
        since: Date;
      }) => Promise<void>;
    };

    const fn2 = m2?.sendMail;
    if (typeof fn2 === "function") return fn2.bind(m2);

    const digest = m2?.sendWeeklyDigest;
    if (typeof digest === "function") {
      const adapter: MailerFn = async (to, _subject, _html) => {
        await digest({ to, name: null, weeklyCount: 0, since: new Date() });
      };
      return adapter;
    }
  } catch { /* ignore */ }

  return null;
}

/* --------------------------------- GET --------------------------------- */
export async function GET(req: NextRequest) {
  if (process.env["VERCEL_ENV"] === "preview") {
    return ok({ skipped: true, reason: "preview-env" });
  }
  if (!checkCronSecret(req)) {
    return noStore({ ok: false, error: "Unauthorized (bad cron secret)" }, { status: 401 });
  }
  if (!hasValidDbUrl()) {
    return ok({ skipped: true, reason: "no-database-url" });
  }

  try {
    const { prisma } = await import("@/app/lib/prisma");
    const mail = await resolveMailer();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const site = baseUrl();

    // Distinct sellers with listings
    const sellerIdRows = (await prisma.product.findMany({
      select: { sellerId: true },
      distinct: ["sellerId"],
      take: 100_000,
    })) as SellerIdRow[];

    const allSellerIds = sellerIdRows.map((r) => r.sellerId).filter((s): s is string => !!s);

    const CHUNK = 200;
    let processed = 0;
    let sent = 0;
    const details: Array<{
      sellerId: string;
      email: string | null;
      newListings: number;
      views: number;
      saves: number;
      sent: boolean;
    }> = [];

    for (let i = 0; i < allSellerIds.length; i += CHUNK) {
      const chunk = allSellerIds.slice(i, i + CHUNK);

      const users = (await prisma.user.findMany({
        where: { id: { in: chunk } },
        select: { id: true, email: true, name: true, username: true },
      })) as UserSlim[];

      const products = (await prisma.product.findMany({
        where: { sellerId: { in: chunk } },
        select: { id: true, sellerId: true, createdAt: true },
      })) as ProductSlim[];

      // sellerId -> { ids, newCount }
      const idsBySeller = new Map<string, { ids: string[]; newCount: number }>();
      for (const p of products) {
        const sId = p.sellerId;
        const entry = idsBySeller.get(sId) ?? { ids: [], newCount: 0 };
        entry.ids.push(p.id);
        if (p.createdAt >= since) entry.newCount++;
        idsBySeller.set(sId, entry);
      }

      const allIds = products.map((p) => p.id);

      const [favAgg, revealAgg] = await Promise.all([
        (async () => {
          try {
            // Use any to avoid Prisma TS inference issue on groupBy generics.
            const favs = (await (prisma as any).favorite.groupBy({
              by: ["productId"],
              where: { productId: { in: allIds }, createdAt: { gte: since } },
              _count: { _all: true },
            })) as Array<{ productId: string; _count: { _all: number } }>;
            const map = new Map<string, number>();
            for (const f of favs) map.set(f.productId, f._count._all ?? 0);
            return map;
          } catch {
            return new Map<string, number>();
          }
        })(),
        (async () => {
          try {
            const anyPrisma = prisma as any;
            if (!anyPrisma.contactReveal?.groupBy) return new Map<string, number>();
            const rows = (await anyPrisma.contactReveal.groupBy({
              by: ["productId"],
              where: { productId: { in: allIds }, createdAt: { gte: since } },
              _count: { _all: true },
            })) as Array<{ productId: string; _count: { _all: number } }>;
            const map = new Map<string, number>();
            for (const r of rows) map.set(r.productId, r._count?._all ?? 0);
            return map;
          } catch {
            return new Map<string, number>();
          }
        })(),
      ]);

      for (const u of users) {
        processed++;
        const info = idsBySeller.get(u.id) ?? { ids: [], newCount: 0 };
        if (info.ids.length === 0) {
          details.push({ sellerId: u.id, email: u.email ?? null, newListings: 0, views: 0, saves: 0, sent: false });
          continue;
        }

        let saves = 0;
        let views = 0;
        for (const pid of info.ids) {
          saves += favAgg.get(pid) ?? 0;
          views += revealAgg.get(pid) ?? 0;
        }

        const shouldSend = saves + views + info.newCount > 0 && !!u.email && !!mail;
        if (shouldSend && mail) {
          const subject = "Your QwikSale weekly digest";
          const html = `
            <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.5">
              <h2 style="margin:0 0 12px">Hi ${u.name || u.username || "there"} 👋</h2>
              <p>Here’s your activity for the last 7 days:</p>
              <ul>
                <li><strong>New listings:</strong> ${info.newCount}</li>
                <li><strong>Contact reveals (views):</strong> ${views}</li>
                <li><strong>Favorites (saves):</strong> ${saves}</li>
              </ul>
              <p><a href="${site}/dashboard" style="color:#39a0ca">Open your dashboard →</a></p>
              <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />
              <p style="color:#666;font-size:12px">You’re receiving this because you have active listings on QwikSale.</p>
            </div>
          `;
          try {
            await mail(u.email!, subject, html);
            sent++;
            details.push({ sellerId: u.id, email: u.email!, newListings: info.newCount, views, saves, sent: true });
          } catch {
            details.push({ sellerId: u.id, email: u.email!, newListings: info.newCount, views, saves, sent: false });
          }
        } else {
          details.push({ sellerId: u.id, email: u.email ?? null, newListings: info.newCount, views, saves, sent: false });
        }
      }
    }

    return ok({ processed, sent, details });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[cron/weekly-digest] error:", e);
    return noStore({ ok: false, error: "Server error" }, { status: 500 });
  }
}
