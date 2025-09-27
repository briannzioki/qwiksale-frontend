export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma"; // align with the rest of the app
import { categories, suggestCategories as suggestCats, slugify } from "@/app/data/categories";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

type SuggestionType = "service"; // normalize to "service" so SearchBox sets t=services
type Suggestion = { label: string; value: string; type: SuggestionType };

function ok(json: unknown, cache = "public, max-age=30, stale-while-revalidate=300") {
  const res = NextResponse.json(json);
  res.headers.set("Cache-Control", cache);
  return res;
}
function nostore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
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
    const limit = Math.max(1, Math.min(20, Number(limitRaw ?? 10) || 10));

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

    // 1) Pull recent ACTIVE service names if the model exists
    try {
      const Service = getServiceModel();
      if (Service) {
        const rows = await Service.findMany({
          where: { status: "ACTIVE" },
          select: { name: true },
          orderBy: { createdAt: "desc" },
          take: 250,
        });
        for (const r of rows) {
          const name = (r?.name ?? "").trim();
          if (name) corpus.push({ label: name, value: name, type: "service" });
        }
      }
    } catch {
      /* best-effort DB fetch; ignore failures and fall back to taxonomy-only */
    }

    // 2) Always include Services category + subcategories (also typed as "service")
    const servicesCat = categories.find((x) => slugify(x.name) === "services");
    if (servicesCat) {
      corpus.push({ label: servicesCat.name, value: servicesCat.name, type: "service" });
      for (const s of servicesCat.subcategories ?? []) {
        const combo = `${servicesCat.name} • ${s.name}`;
        corpus.push({ label: combo, value: combo, type: "service" });
      }
    }

    // Rank + de-dupe by label (case-insensitive)
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

    // Backfill with taxonomy suggestions if needed (only keep Services-related)
    if (servicesCat && out.length < limit) {
      const catBoost = suggestCats(q, limit - out.length);
      for (const label of catBoost) {
        const keep =
          label === servicesCat.name || label.startsWith(`${servicesCat.name} •`);
        if (!keep) continue;
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        out.push({ label, value: label, type: "service" });
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
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
