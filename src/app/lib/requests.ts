// src/app/lib/requests.ts

export type RequestKind = "product" | "service";

export type RequestStatus =
  | "ACTIVE"
  | "OPEN"
  | "CLOSED"
  | "EXPIRED"
  | "DRAFT"
  | "HIDDEN"
  | "DELETED";

export type RequestPublic = {
  id: string;
  kind: RequestKind;
  title: string;
  description?: string | null;
  location?: string | null;
  category?: string | null;
  tags?: string[] | null;
  status: string;
  createdAt: string | null;
  expiresAt: string | null;
  boostUntil: string | null;
};

export type RequestAdmin = RequestPublic & {
  ownerId?: string | null;
  contactEnabled?: boolean | null;
  contactMode?: string | null;
};

export function toIso(value: unknown): string | null {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(String(value));
    const t = d.getTime();
    if (!Number.isFinite(t)) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export function isBoosted(boostUntilIso: string | null | undefined, now = new Date()): boolean {
  if (!boostUntilIso) return false;
  const t = new Date(boostUntilIso).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

export function isExpired(expiresAtIso: string | null | undefined, now = new Date()): boolean {
  if (!expiresAtIso) return false;
  const t = new Date(expiresAtIso).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

export function computeExpiresAt(now: Date, daysFromNow: number): Date {
  const days = Math.max(1, Math.min(365, Math.trunc(daysFromNow)));
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function excerpt(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const s = String(text).replace(/\s+/g, " ").trim();
  if (!s) return null;
  const n = Math.max(20, Math.min(1000, Math.trunc(max)));
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function safeString(v: unknown, max = 200): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function safeKind(v: unknown): RequestKind {
  const s = String(v ?? "").toLowerCase();
  return s === "service" ? "service" : "product";
}

function safeStringOrNull(v: unknown, max = 200): string | null {
  const s = safeString(v, max);
  return s ? s : null;
}

function safeTags(v: unknown, maxItems = 10): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const raw of v) {
    const s = safeString(raw, 40).toLowerCase();
    if (!s) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= Math.max(0, Math.min(50, Math.trunc(maxItems)))) break;
  }
  return out.length ? out : null;
}

/**
 * Safe-field projection for public responses (no contact fields).
 * Accepts any raw request row (Prisma or API object) and returns a stable shape.
 */
export function projectPublicRequest(raw: any): RequestPublic {
  const id = safeString(raw?.id, 200);
  const title = safeString(raw?.title ?? raw?.name, 140) || "Untitled";
  const description = raw?.description != null ? String(raw.description) : null;

  return {
    id,
    kind: safeKind(raw?.kind),
    title,
    description: description,
    location: safeStringOrNull(raw?.location, 120),
    category: safeStringOrNull(raw?.category, 80),
    tags: safeTags(raw?.tags, 10),
    status: safeString(raw?.status, 40) || "ACTIVE",
    createdAt: toIso(raw?.createdAt),
    expiresAt: toIso(raw?.expiresAt),
    boostUntil: toIso(raw?.boostUntil),
  };
}

/**
 * Projection for admin responses (includes extra fields).
 * Still keeps a stable JSON-serializable shape.
 */
export function projectAdminRequest(raw: any): RequestAdmin {
  const base = projectPublicRequest(raw);
  return {
    ...base,
    ownerId: safeStringOrNull(raw?.ownerId, 200),
    contactEnabled:
      typeof raw?.contactEnabled === "boolean" ? raw.contactEnabled : raw?.contactEnabled != null ? Boolean(raw.contactEnabled) : null,
    contactMode: safeStringOrNull(raw?.contactMode, 40),
  };
}

/**
 * Feed ordering rule: boosted first (boostUntil > now) then newest.
 * For Prisma orderBy: boostUntil desc + createdAt desc is sufficient (nulls last).
 */
export function orderByForFeed() {
  return [{ boostUntil: "desc" as const }, { createdAt: "desc" as const }];
}

/**
 * Admin default ordering (same as feed for convenience).
 */
export function orderByForAdminList() {
  return orderByForFeed();
}
