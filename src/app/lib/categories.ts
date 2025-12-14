// src/app/lib/categories.ts

// Central export surface for category + subcategory logic.
// Wraps the static catalog in src/app/data/categories so we can
// later swap to DB-backed categories or API lookups without
// rewriting every import.

// NOTE: This file is written to be friendly to
// `exactOptionalPropertyTypes: true`. Never pass explicit `undefined`
// into optional string fields – instead, omit the property entirely.

import type {
  CategoryNode,
  CategoryPath,
} from "@/app/data/categories";

import {
  categories as STATIC_CATEGORIES,
  listCategories,
  listSubcategories,
  listSubsubcategories,
  ensureValidSelection,
  findPathByNames,
  findPathBySlugs,
  breadcrumbs,
  suggestCategories,
  categoryOptions,
  subcategoryOptions,
  subsubcategoryOptions,
  flattenedPaths,
  DEFAULT_CATEGORY,
  DEFAULT_SUBCATEGORY,
  CategoryMaps,
  slugify,
} from "@/app/data/categories";

export type { CategoryNode, CategoryPath };

// Primary catalog – treat as readonly.
export const categories: readonly CategoryNode[] =
  STATIC_CATEGORIES;

// Re-export the existing utilities so callers only ever import
// from "@/app/lib/categories".
export {
  listCategories,
  listSubcategories,
  listSubsubcategories,
  ensureValidSelection,
  findPathByNames,
  findPathBySlugs,
  breadcrumbs,
  suggestCategories,
  categoryOptions,
  subcategoryOptions,
  subsubcategoryOptions,
  flattenedPaths,
  DEFAULT_CATEGORY,
  DEFAULT_SUBCATEGORY,
  CategoryMaps,
  slugify,
};

/**
 * Minimal filter shape suitable for:
 * - search query params
 * - API filters
 * - store keys / cache keys
 *
 * All fields are optional; omit rather than set `undefined`.
 */
export type CategoryFilter = {
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
};

/**
 * Normalize a possibly-messy category/subcategory tuple into a safe
 * CategoryPath you can feed into UI or query builders.
 *
 * - Accepts null/undefined/string inputs.
 * - Trims whitespace.
 * - Relies on `ensureValidSelection` to snap to a real category.
 *
 * IMPORTANT: We only assign properties that have a real string value
 * to stay compatible with `exactOptionalPropertyTypes: true` and
 * with `CategoryPath` being readonly.
 */
export function resolveCategorySelection(
  input:
    | {
        category?: string | null;
        subcategory?: string | null;
        subsubcategory?: string | null;
      }
    | null
    | undefined,
): CategoryPath {
  // Use a mutable builder type, then cast once to CategoryPath.
  const path: {
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
  } = {};

  if (input?.category) {
    const c = input.category.trim();
    if (c) path.category = c;
  }

  if (input?.subcategory) {
    const s = input.subcategory.trim();
    if (s) path.subcategory = s;
  }

  if (input?.subsubcategory) {
    const ss = input.subsubcategory.trim();
    if (ss) path.subsubcategory = ss;
  }

  return ensureValidSelection(path as CategoryPath);
}

/**
 * Build a minimal search filter object from a CategoryPath.
 * Helpful for wiring into `/search` query params or API payloads.
 */
export function toFilter(
  selection: CategoryPath,
): CategoryFilter {
  const snap = ensureValidSelection(selection);
  const out: CategoryFilter = {};
  if (snap.category) out.category = snap.category;
  if (snap.subcategory)
    out.subcategory = snap.subcategory;
  if (snap.subsubcategory)
    out.subsubcategory = snap.subsubcategory;
  return out;
}

/**
 * Inverse of `toFilter` – turn a filter back into a snapped CategoryPath.
 * Safe to call with `null` / `undefined` and will fall back to defaults.
 */
export function fromFilter(
  filter: CategoryFilter | null | undefined,
): CategoryPath {
  if (!filter) {
    // empty path -> ensureValidSelection will snap to DEFAULT_CATEGORY
    return ensureValidSelection({} as CategoryPath);
  }
  return resolveCategorySelection(filter);
}

/**
 * Compare two CategoryPath-ish values for logical equality.
 * Uses slugified labels so minor casing/spacing differences
 * don't cause a mismatch.
 */
export function isSameCategoryPath(
  a: CategoryPath | null | undefined,
  b: CategoryPath | null | undefined,
): boolean {
  const snapA = ensureValidSelection(
    (a ?? {}) as CategoryPath,
  );
  const snapB = ensureValidSelection(
    (b ?? {}) as CategoryPath,
  );

  const catA = slugify(snapA.category!);
  const catB = slugify(snapB.category!);
  if (catA !== catB) return false;

  const subA = snapA.subcategory
    ? slugify(snapA.subcategory)
    : "";
  const subB = snapB.subcategory
    ? slugify(snapB.subcategory)
    : "";
  if (subA !== subB) return false;

  const subsubA = snapA.subsubcategory
    ? slugify(snapA.subsubcategory)
    : "";
  const subsubB = snapB.subsubcategory
    ? slugify(snapB.subsubcategory)
    : "";
  return subsubA === subsubB;
}

/**
 * Human-readable "Category › Subcategory › Subsub" label for UIs.
 * Always returns at least the top-level category.
 */
export function formatCategory(
  selection: CategoryPath,
): string {
  const snap = ensureValidSelection(selection);
  const parts: string[] = [];
  if (snap.category) parts.push(snap.category);
  if (snap.subcategory)
    parts.push(snap.subcategory);
  if (snap.subsubcategory)
    parts.push(snap.subsubcategory);
  return parts.join(" › ");
}

/**
 * Quick validity check for a category label (by name or slug).
 */
export function isKnownCategory(
  category?: string | null,
): boolean {
  if (!category) return false;
  const c = category.trim();
  if (!c) return false;

  if (CategoryMaps.byName.has(c)) return true;

  const catSlug = slugify(c);
  return CategoryMaps.bySlug.has(catSlug);
}

/**
 * Quick validity check for a (category, subcategory) pair.
 * Uses canonical names under the hood.
 */
export function isKnownSubcategory(
  category?: string | null,
  subcategory?: string | null,
): boolean {
  if (!category || !subcategory) return false;
  const snap = ensureValidSelection({
    category: category.trim(),
    subcategory: subcategory.trim(),
  } as CategoryPath);
  if (!snap.category || !snap.subcategory)
    return false;

  const subs =
    CategoryMaps.subsByCat.get(snap.category) ??
    [];
  return subs.some(
    (s) => s.name === snap.subcategory,
  );
}
