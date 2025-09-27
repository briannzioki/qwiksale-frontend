export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { products, distinctBrands } from "@/app/data/products";
import { categories, suggestCategories as suggestCats, slugify } from "@/app/data/categories";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

type SuggestionType = "name" | "brand" | "category" | "subcategory" | "service";
type Suggestion = { label: string; value: string; type: SuggestionType };

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(20, Number(limitRaw ?? 10) || 10));

    if (!q) return ok({ items: [] as Suggestion[] });

    if (typeof checkRateLimit === "function") {
      const rl = await checkRateLimit(request.headers as unknown as Headers, {
        name: "products_suggest",
        limit: 30,
        windowMs: 60_000,
      });
      if (!rl.ok) return tooMany("Too many requests. Please slow down and try again.", rl.retryAfterSec);
    }

    const corpus: Suggestion[] = [];

    // Product names
    for (const p of products) {
      if (p?.name) corpus.push({ label: p.name, value: p.name, type: "name" });
    }
    // Brands
    for (const b of distinctBrands()) {
      corpus.push({ label: b, value: b, type: "brand" });
    }
    // Categories + subcategories
    for (const c of categories) {
      corpus.push({ label: c.name, value: c.name, type: "category" });
      for (const s of c.subcategories ?? []) {
        const combo = `${c.name} • ${s.name}`;
        corpus.push({ label: combo, value: combo, type: "subcategory" });
      }
    }
    // Services (from taxonomy) so SearchBox can switch mode
    const services =
      (categories.find((x) => slugify(x.name) === "services")?.subcategories ?? []).map((s) => s.name);
    for (const svc of services) {
      corpus.push({ label: svc, value: svc, type: "service" });
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

    // Backfill with taxonomy suggestions if needed
    if (out.length < limit) {
      const catBoost = suggestCats(q, limit - out.length);
      for (const label of catBoost) {
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        const isCombo = label.includes("•");
        out.push({ label, value: label, type: isCombo ? "subcategory" : "category" });
        seen.add(key);
        if (out.length >= limit) break;
      }
    }

    return ok({ items: out });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[products/suggest GET] error", e);
    return nostore({ items: [] });
  }
}

export async function HEAD() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
