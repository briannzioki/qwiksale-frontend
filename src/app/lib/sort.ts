// src/app/lib/sort.ts
export type SortKey =
  | "relevant"   // default for search (uses text relevance / ranking on backend)
  | "newest"     // createdAt desc
  | "price_asc"  // price asc (0/null last)
  | "price_desc" // price desc
  | "featured";  // boosts featured/pinned

export const SORT_DEFAULT: SortKey = "relevant";

export function isSortKey(v: unknown): v is SortKey {
  return v === "relevant" || v === "newest" || v === "price_asc" || v === "price_desc" || v === "featured";
}

// Optional: map to API/back-end param names, if different.
export const SORT_TO_API: Record<SortKey, string> = {
  relevant: "relevant",
  newest: "created_desc",
  price_asc: "price_asc",
  price_desc: "price_desc",
  featured: "featured",
};

// Parse from URLSearchParams safely
export function parseSort(sp: URLSearchParams | { sort?: string | null | undefined }): SortKey {
  const v = sp instanceof URLSearchParams ? sp.get("sort") : sp?.sort;
  return isSortKey(v) ? v : SORT_DEFAULT;
}
