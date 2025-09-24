// src/app/api/services/suggest/route.ts
// Runtime config
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { categories, suggestCategories as suggestCats, slugify } from "@/app/data/categories";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

type SuggestionType = "name" | "category" | "subcategory";
type Suggestion = { label: string; value: string; type: SuggestionType };

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

const toAscii = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
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
    name: "services_suggest",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return tooMany("Too many requests. Please slow down and try again.", rl.retryAfterSec);
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
        if (name) corpus.push({ label: name, value: name, type: "name" });
      }
    }
  } catch {
    /* best-effort DB fetch; ignore failures and fall back to taxonomy-only */
  }

  // 2) Always include Services category + subcategories
  const servicesCat = categories.find((x) => slugify(x.name) === "services");
  if (servicesCat) {
    corpus.push({ label: servicesCat.name, value: servicesCat.name, type: "category" });
    for (const s of servicesCat.subcategories ?? []) {
      const combo = `${servicesCat.name} • ${s.name}`;
      corpus.push({ label: combo, value: combo, type: "subcategory" });
    }
  }

  // Rank + trim
  const ranked = corpus
    .map((item) => ({ item, score: scoreLabel(q, item.label) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map((x) => x.item);

  // Backfill with taxonomy suggestions if needed
  const catBoost = suggestCats(q, Math.max(0, limit - ranked.length));
  for (const label of catBoost) {
    // keep only Services-related suggestions if we already have rankers from this endpoint
    const keep =
      !servicesCat ||
      label === servicesCat.name ||
      label.startsWith(`${servicesCat.name} •`);
    if (!keep) continue;

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
