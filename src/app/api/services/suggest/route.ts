export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  categories,
  suggestCategories as suggestCats,
  slugify,
} from "@/app/data/categories";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

const SUG_VER = "vSERV-004";

type SuggestionType = "service";
type Suggestion = {
  label: string;
  type: SuggestionType;
  value?: string;
  category?: string;
  subcategory?: string;
};

function withCommonHeaders(res: NextResponse) {
  res.headers.set("X-Suggest-Version", SUG_VER);
  return res;
}
function ok(json: unknown, cache = "public, max-age=30, stale-while-revalidate=300") {
  const res = NextResponse.json(json);
  res.headers.set("Cache-Control", cache);
  return withCommonHeaders(res);
}
function nostore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store");
  return withCommonHeaders(res);
}

function toAscii(s: string) {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}
function tokens(s: string): string[] {
  return toAscii(s).toLowerCase().split(/\s+/).filter(Boolean);
}
function scoreLabel(q: string, label: string) {
  const qs = tokens(q);
  const ls = toAscii(label).toLowerCase();
  if (!qs.length) return -1;
  if (!qs.every((t) => ls.includes(t))) return -1;
  const starts = qs[0] && ls.startsWith(qs[0]) ? 250 : 0;
  const exact = ls === qs.join(" ") ? 1000 : 0;
  const brevity = Math.max(0, 120 - ls.length);
  return exact + 300 + starts + brevity;
}

/** Access a Service-model compat layer that may not exist in this schema */
function getServiceModel() {
  const anyPrisma = prisma as any;
  const svc =
    anyPrisma.service ??
    anyPrisma.services ??
    anyPrisma.Service ??
    anyPrisma.Services ??
    null;
  return typeof svc?.findMany === "function" ? svc : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(20, Number(limitRaw ?? 12) || 12));

    if (!q) return ok({ items: [] as Suggestion[] });

    if (typeof checkRateLimit === "function") {
      const rl = await checkRateLimit(request.headers as unknown as Headers, {
        name: "services_suggest",
        limit: 30,
        windowMs: 60_000,
      });
      if (!rl.ok) {
        return tooMany("Too many requests. Please slow down and try again.", rl.retryAfterSec);
      }
    }

    const corpus: Suggestion[] = [];

    // 1) Pull recent ACTIVE service names, tolerant to schema
    try {
      const Service = getServiceModel();
      if (Service) {
        const rows = await Service.findMany({
          where: { status: "ACTIVE", name: { not: null } }, // <-- fixed
          select: { name: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 250,
        });
        for (const r of rows) {
          const name = (r?.name ?? "").trim();
          if (name) {
            corpus.push({
              label: name,
              type: "service",
              value: name,
              category: "Services",
            });
          }
        }
      }
    } catch {
      /* best-effort DB fetch */
    }

    // 2) Services category + subcategories as typed "service"
    const servicesCat = categories.find((x) => slugify(x.name) === "services");
    if (servicesCat) {
      const cName = (servicesCat.name ?? "").trim();
      if (cName) {
        corpus.push({
          label: cName,
          type: "service",
          value: cName,
          category: cName,
        });
      }
      for (const s of servicesCat.subcategories ?? []) {
        const sName = (s?.name ?? "").trim();
        if (!sName) continue;
        const combo = `${cName} • ${sName}`;
        corpus.push({
          label: combo,
          type: "service",
          value: sName,
          category: cName,
          subcategory: sName,
        });
      }
    }

    // Rank + de-dupe
    const ranked = corpus
      .map((item) => ({ item, score: scoreLabel(q, item.label) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));

    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const r of ranked) {
      const key = r.item.label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r.item);
      if (out.length >= limit) break;
    }

    // 3) Backfill with taxonomy suggestions (only Services-related labels)
    if (servicesCat && out.length < limit) {
      const catBoost = suggestCats(q, limit - out.length);
      for (const label of catBoost) {
        const keep =
          label.toLowerCase() === servicesCat.name.toLowerCase() ||
          label.startsWith(`${servicesCat.name} •`);
        if (!keep) continue;

        const key = label.toLowerCase();
        if (seen.has(key)) continue;

        if (label.includes("•")) {
          const [parent, child] = label.split("•").map((s) => s.trim());
          out.push({
            label,
            type: "service",
            ...(child ? { value: child } : {}),
            ...(parent ? { category: parent } : {}),
            ...(child ? { subcategory: child } : {}),
          });
        } else {
          out.push({
            label,
            type: "service",
            value: label,
            category: label,
          });
        }

        seen.add(key);
        if (out.length >= limit) break;
      }
    }

    return ok({ items: out });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/suggest GET] error", e);
    return nostore({ items: [] });
  }
}

export async function HEAD() {
  return withCommonHeaders(
    new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })
  );
}
