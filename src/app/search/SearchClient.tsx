// src/app/search/SearchClient.tsx
"use client";

import type { ReactNode } from "react";

/** 🔒 Unified sort enum for search across product/service */
export type Sort = "newest" | "featured" | "price_asc" | "price_desc";

/** Labels shown in the sort <select> (keep in sync with backend if needed) */
export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "featured", label: "Featured first" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
] as const satisfies ReadonlyArray<{ value: Sort; label: string }>;

/**
 * Passthrough wrapper (kept for future client-side search enhancements).
 * You can add context, analytics, or keyboard handlers here later.
 */
export default function SearchClient({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
