// src/app/api/suggest/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { products, distinctBrands } from "@/app/data/products";
import {
  categories,
  suggestCategories as suggestCats,
  slugify,
} from "@/app/data/categories";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

const SUG_VER = "vUNIFIED-004";

type SuggestionType = "name" | "brand" | "category" | "subcategory" | "service";

type Suggestion = {
  label: string;
  type: SuggestionType;
  /** Optional richer mapping fields used by the SearchBox */
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

/** Optional Service-model compatibility (schema may vary) */
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
        name: "unified_suggest",
        limit: 40,
        windowMs: 60_000,
      });
      if (!rl.ok) {
        return tooMany("Too many requests. Please slow down and try again.", rl.retryAfterSec);
      }
    }

    const corpus: Suggestion[] = [];

    // ---- Products: names ----
    for (const p of products) {
      const name = (p?.name ?? "").trim();
      if (name) corpus.push({ label: name, type: "name", value: name });
    }

    // ---- Products: brands ----
    for (const b of distinctBrands()) {
      if (b) corpus.push({ label: b, type: "brand", value: b });
    }

    // ---- Taxonomy: categories + subcategories (products & services) ----
    for (const c of categories) {
      const cName = (c?.name ?? "").trim();
      if (!cName) continue;

      // Services category will be handled as service-type suggestions
      const isServices = slugify(cName) === "services";
      if (!isServices) {
        corpus.push({
          label: cName,
          type: "category",
          value: cName,
          category: cName,
        });
      }

      for (const s of c.subcategories ?? []) {
        const sName = (s?.name ?? "").trim();
        if (!sName) continue;
        const combo = `${cName} • ${sName}`;

        if (isServices) {
          corpus.push({
            label: combo,
            type: "service",
            value: sName,
            category: cName,
            subcategory: sName,
          });
        } else {
          corpus.push({
            label: combo,
            type: "subcategory",
            value: sName,
            category: cName,
            subcategory: sName,
          });
        }
      }
    }

    // ---- Services: recent names from DB (if model exists) ----
    try {
      const Service = getServiceModel();
      if (Service) {
        const rows = await Service.findMany({
          where: { status: "ACTIVE", name: { not: null } },
          select: { name: true },
          orderBy: { createdAt: "desc" },
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
      /* best-effort */
    }

    // ---- Ranking + de-dupe (by label, case-insensitive) ----
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

    // ---- Backfill from taxonomy helper if still short ----
    if (out.length < limit) {
      const boost = suggestCats(q, limit - out.length);
      for (const label of boost) {
        const key = label.toLowerCase();
        if (seen.has(key)) continue;

        const isServicesLike = label.toLowerCase().startsWith("services");
        if (label.includes("•")) {
          const [parent, child] = label.split("•").map((s) => s.trim());
          out.push({
            label,
            type: isServicesLike ? "service" : "subcategory",
            ...(child ? { value: child } : {}),
            ...(parent ? { category: parent } : {}),
            ...(child ? { subcategory: child } : {}),
          });
        } else {
          out.push({
            label,
            type: isServicesLike ? "service" : "category",
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
    console.warn("[unified/suggest GET] error", e);
    return nostore({ items: [] });
  }
}

export async function HEAD() {
  return withCommonHeaders(
    new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })
  );
}
