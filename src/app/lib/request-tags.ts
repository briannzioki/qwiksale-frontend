// src/app/lib/request-tags.ts

export type RequestCategory = {
  key: string;
  label: string;
  tags: readonly string[];
};

export const REQUEST_CATEGORIES: readonly RequestCategory[] = [
  {
    key: "electronics",
    label: "Electronics",
    tags: ["phone", "laptop", "tablet", "tv", "camera", "console", "accessories"],
  },
  {
    key: "vehicles",
    label: "Vehicles",
    tags: ["car", "motorbike", "spare-parts", "tyres", "battery", "maintenance"],
  },
  {
    key: "home",
    label: "Home & Living",
    tags: ["furniture", "appliances", "kitchen", "decor", "bedding", "tools"],
  },
  {
    key: "fashion",
    label: "Fashion",
    tags: ["shoes", "clothing", "bags", "watches", "jewelry"],
  },
  {
    key: "services",
    label: "Services",
    tags: ["plumbing", "electrician", "moving", "cleaning", "photography", "design", "web-dev", "repairs"],
  },
  {
    key: "jobs",
    label: "Jobs & Gigs",
    tags: ["freelance", "part-time", "full-time", "remote", "contract"],
  },
  {
    key: "other",
    label: "Other",
    tags: ["misc"],
  },
];

export const REQUEST_CATEGORY_KEYS: readonly string[] = REQUEST_CATEGORIES.map((c) => c.key);

export const REQUEST_CATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze(
  REQUEST_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = c.label;
    return acc;
  }, {} as Record<string, string>),
);

export const REQUEST_TAGS_BY_CATEGORY: Readonly<Record<string, readonly string[]>> = Object.freeze(
  REQUEST_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = c.tags;
    return acc;
  }, {} as Record<string, readonly string[]>),
);

export const ALL_REQUEST_TAGS: readonly string[] = Object.freeze(
  Array.from(
    new Set(
      REQUEST_CATEGORIES.flatMap((c) => c.tags).map((t) => String(t).toLowerCase().trim()).filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b)),
);

export function normalizeCategory(input: unknown): string | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;

  // accept either key or label (case-insensitive)
  const byKey = REQUEST_CATEGORIES.find((c) => c.key === s);
  if (byKey) return byKey.key;

  const byLabel = REQUEST_CATEGORIES.find((c) => c.label.toLowerCase() === s);
  if (byLabel) return byLabel.key;

  return null;
}

export function normalizeTags(input: unknown, opts?: { max?: number; allowUnknown?: boolean }): string[] {
  const max = Math.max(0, Math.min(50, Math.trunc(opts?.max ?? 10)));
  const allowUnknown = Boolean(opts?.allowUnknown);

  const raw =
    Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : ([] as unknown[]);

  const out: string[] = [];
  for (const v of raw) {
    const s = String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (!s) continue;
    if (!allowUnknown && !ALL_REQUEST_TAGS.includes(s)) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function tagsForCategory(categoryKey: unknown): readonly string[] {
  const k = normalizeCategory(categoryKey);
  if (!k) return [];
  return REQUEST_TAGS_BY_CATEGORY[k] || [];
}

export function categoryLabel(categoryKey: unknown): string | null {
  const k = normalizeCategory(categoryKey);
  if (!k) return null;
  return REQUEST_CATEGORY_LABELS[k] || null;
}
