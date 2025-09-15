// src/app/api/products/suggest/route.ts
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

const toAscii = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const now = () => Date.now();
const WINDOW_MS = 10_000;
const LIMIT = 30;

function tokens(s: string): string[] {
  return toAscii(s).toLowerCase().split(/\s+/).filter(Boolean);
}
function scoreLabel(q: string, label: string) {
  const qs = tokens(q);
  const ls = toAscii(label).toLowerCase();
  if (!qs.length) return -1;
  const allMatch = qs.every((t) => ls.includes(t));
  if (!allMatch) return -1;
  const firstTok = qs[0] ?? "";
  const starts = firstTok && ls.startsWith(firstTok) ? 250 : 0;
  const exact = ls === qs.join(" ") ? 1000 : 0;
  const brevity = Math.max(0, 120 - ls.length);
  return exact + 300 + starts + brevity;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.max(1, Math.min(20, Number(url.searchParams.get("limit") || 10)));

  if (!q) {
    const empty = NextResponse.json({ items: [] as Suggestion[] }, { status: 200 });
    empty.headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    return empty;
  }

  // Global per-IP throttle with 429s
  const rl = await checkRateLimit(request.headers as unknown as Headers, {
    name: "products_suggest",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return tooMany("Too many requests. Please slow down and try again.", rl.retryAfterSec);
  }

  const corpus: Suggestion[] = [];

  for (const p of products) if (p?.name) corpus.push({ label: p.name, value: p.name, type: "name" });
  for (const b of distinctBrands()) corpus.push({ label: b, value: b, type: "brand" });
  for (const c of categories) {
    corpus.push({ label: c.name, value: c.name, type: "category" });
    for (const s of c.subcategories ?? []) {
      const combo = `${c.name} • ${s.name}`;
      corpus.push({ label: combo, value: combo, type: "subcategory" });
    }
  }
  const services =
    (categories.find((x) => slugify(x.name) === "services")?.subcategories ?? []).map((s) => s.name);
  for (const svc of services) {
    corpus.push({ label: svc, value: svc, type: "service" });
  }

  const ranked = corpus
    .map((item) => ({ item, score: scoreLabel(q, item.label) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map((x) => x.item);

  const catBoost = suggestCats(q, Math.max(0, limit - ranked.length));
  for (const label of catBoost) {
    if (!ranked.some((r) => r.label === label)) {
      const isCombo = label.includes("•");
      ranked.push({ label, value: label, type: isCombo ? "subcategory" : "category" });
      if (ranked.length >= limit) break;
    }
  }

  const res = NextResponse.json({ items: ranked });
  res.headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
  return res;
}
