import type { Metadata } from "next";
import type React from "react";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeStoreSlug(raw?: string) {
  let v = "";
  try {
    v = decodeURIComponent(String(raw ?? "")).trim();
  } catch {
    v = String(raw ?? "").trim();
  }
  return v.replace(/^@+/, "");
}

function cleanUsername(raw?: string) {
  const v = normalizeStoreSlug(raw);
  return /^[a-z0-9._-]{2,128}$/i.test(v) ? v : "";
}

function stripLeadingUPrefixes(v: string) {
  let cur = String(v || "").trim();
  for (let i = 0; i < 4; i++) {
    const m = /^u-(.+)$/i.exec(cur);
    if (!m?.[1]) break;
    cur = m[1].trim();
  }
  return cur;
}

function parseSellerId(raw?: string): string | null {
  const v0 = normalizeStoreSlug(raw);
  if (!v0) return null;

  const hadUPrefix = /^u-/i.test(v0);
  const tail = hadUPrefix ? stripLeadingUPrefixes(v0) : v0;
  if (!tail) return null;

  if (hadUPrefix) return tail;

  // match store page behavior (ids without u-)
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      tail,
    )
  )
    return tail;
  if (/^[0-9a-f]{24}$/i.test(tail)) return tail;
  if (/^[0-9a-f-]{32,36}$/i.test(tail)) return tail;
  if (/^c[0-9a-z]{20,}$/i.test(tail)) return tail;

  return null;
}

function toFiniteNumberIfExactIntString(v: string): number | null {
  const s = String(v || "").trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseStoreNumericSuffix(slug: string): number | null {
  const s = String(slug || "").trim();
  if (!s) return null;

  const m = /^(?:sto|store)[-_]?(\d{1,18})$/i.exec(s);
  if (m?.[1]) return toFiniteNumberIfExactIntString(m[1]);
  if (/^\d{1,18}$/.test(s)) return toFiniteNumberIfExactIntString(s);
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username: raw } = await params;

  const slug = normalizeStoreSlug(raw);
  const sellerIdFromUrl = parseSellerId(slug);
  const usernameFromUrl = sellerIdFromUrl ? "" : cleanUsername(slug);
  const storeNumeric = parseStoreNumericSuffix(slug);

  // Default canonical: whatever is in the URL (still better than none).
  let canonicalSlug = slug || raw || "store";

  try {
    if (usernameFromUrl) {
      const u = await prisma.user.findFirst({
        where: { username: { equals: usernameFromUrl, mode: "insensitive" } },
        select: { username: true },
      });
      if (u?.username) canonicalSlug = u.username;
    } else if (sellerIdFromUrl) {
      const u = await prisma.user.findUnique({
        where: { id: sellerIdFromUrl },
        select: { username: true, id: true },
      });
      if (u?.username) canonicalSlug = u.username;
      else if (u?.id) canonicalSlug = `u-${String(u.id)}`;
    } else if (slug) {
      // ✅ also canonicalize referralCode / store-code slugs when they map to a real user
      const tokens = Array.from(
        new Set(
          [
            slug,
            storeNumeric != null ? `sto-${storeNumeric}` : "",
            storeNumeric != null ? `store-${storeNumeric}` : "",
          ].filter(Boolean),
        ),
      );

      for (const t of tokens) {
        const u = await prisma.user.findFirst({
          where: { referralCode: { equals: t, mode: "insensitive" } },
          select: { username: true, id: true },
        });
        if (u?.username) {
          canonicalSlug = u.username;
          break;
        }
        if (u?.id) {
          canonicalSlug = `u-${String(u.id)}`;
          break;
        }
      }
    }
  } catch {
    // ignore (canonical still set)
  }

  return {
    alternates: { canonical: `/store/${encodeURIComponent(canonicalSlug)}` },
    robots: { index: true, follow: true },
  };
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
