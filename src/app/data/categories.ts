// src/app/data/categories.ts

export interface Category {
  name: string;
  subcategories?: {
    name: string;
    subsubcategories?: string[];
  }[];
}

/**
 * Canonical categories used across filters, posting, breadcrumbs, etc.
 * NOTE:
 * - Added "Musical Instruments" under Sports & Outdoors (matches your seed data).
 * - Added "Others" with "Books" (your seed has category "Others" / subcategory "Books").
 */
export const categories: readonly Category[] = [
  {
    name: "Electronics",
    subcategories: [
      {
        name: "Phones & Tablets",
        subsubcategories: [
          "Smartphones",
          "Feature Phones",
          "Tablets",
          "Phone Accessories",
          "Chargers & Cables",
          "Power Banks",
        ],
      },
      {
        name: "Computers & Laptops",
        subsubcategories: [
          "Laptops",
          "Desktops",
          "Monitors",
          "Computer Accessories",
          "Printers & Scanners",
        ],
      },
      {
        name: "Home Appliances",
        subsubcategories: [
          "Televisions",
          "Sound Systems",
          "Refrigerators",
          "Cookers & Ovens",
          "Washing Machines",
          "Microwaves",
        ],
      },
      { name: "Gaming", subsubcategories: ["Consoles", "Controllers", "Games", "VR"] },
      { name: "Cameras", subsubcategories: ["DSLR", "Mirrorless", "Lenses", "Action Cameras"] },
    ],
  },
  {
    name: "Vehicles",
    subcategories: [
      { name: "Cars", subsubcategories: ["Sedans", "SUVs", "Pickups", "Trucks", "Vans & Buses"] },
      { name: "Motorcycles", subsubcategories: ["Street Bikes", "Scooters", "Off-road"] },
      {
        name: "Vehicle Parts & Accessories",
        subsubcategories: ["Tyres & Rims", "Batteries", "Engines & Gearboxes", "Car Electronics"],
      },
    ],
  },
  {
    name: "Property",
    subcategories: [
      { name: "Houses & Apartments for Sale" },
      { name: "Houses & Apartments for Rent" },
      { name: "Land & Plots", subsubcategories: ["Residential Plots", "Commercial Plots", "Farms & Acreage"] },
      { name: "Commercial Property" },
    ],
  },
  {
    name: "Fashion",
    subcategories: [
      { name: "Clothing", subsubcategories: ["Men", "Women", "Kids", "Unisex"] },
      { name: "Shoes", subsubcategories: ["Sneakers", "Formal Shoes", "Boots", "Sandals"] },
      { name: "Watches & Jewelry", subsubcategories: ["Watches", "Necklaces", "Rings", "Bracelets"] },
      { name: "Bags", subsubcategories: ["Handbags", "Backpacks", "Suitcases"] },
    ],
  },
  {
    name: "Home & Garden",
    subcategories: [
      { name: "Furniture", subsubcategories: ["Living Room", "Bedroom", "Office", "Outdoor"] },
      { name: "Home Decor" },
      { name: "Kitchenware" },
      { name: "Gardening Tools" },
    ],
  },
  {
    name: "Health & Beauty",
    subcategories: [{ name: "Skincare" }, { name: "Makeup" }, { name: "Haircare" }, { name: "Fragrances" }],
  },
  {
    name: "Sports & Outdoors",
    subcategories: [
      { name: "Fitness Equipment" },
      { name: "Sportswear" },
      { name: "Camping & Hiking" },
      { name: "Bicycles" },
      // Added to match your product seed data
      { name: "Musical Instruments", subsubcategories: ["Guitars", "Keyboards", "DJ Equipment", "Accessories"] },
    ],
  },
  {
    name: "Kids & Babies",
    subcategories: [{ name: "Baby Gear" }, { name: "Toys" }, { name: "Kids Clothing" }],
  },
  {
    // Added to match your "Others > Books" products
    name: "Others",
    subcategories: [{ name: "Books" }, { name: "Stationery" }, { name: "Arts & Crafts" }, { name: "Miscellaneous" }],
  },
] as const;

/* ------------------------------------------------------------------ */
/* --------------------------- Derivatives --------------------------- */
/* ------------------------------------------------------------------ */

type Cat = (typeof categories)[number];
type Sub = NonNullable<Cat["subcategories"]>[number];

export type CategoryName = Cat["name"];
export type SubcategoryName<C extends CategoryName = CategoryName> = Extract<
  Sub["name"],
  string
>;
export type SubsubcategoryName = string;

export type CategoryPath = {
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
};

/** Slugify for URLs / keys (lowercase, ascii, hyphen). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const ciEq = (a?: string, b?: string) =>
  (a || "").toLocaleLowerCase() === (b || "").toLocaleLowerCase();
const ciIn = (a: string, b: string) => a.toLocaleLowerCase().includes(b.toLocaleLowerCase());

/** Build fast lookup maps */
const CAT_BY_NAME = new Map<string, Cat>();
const CAT_BY_SLUG = new Map<string, Cat>();
const SUB_BY_CAT_NAME = new Map<string, Sub[]>();
const SUB_BY_CAT_SLUG_AND_SUB_SLUG = new Map<string, Sub>(); // key = `${catSlug}/${subSlug}`

for (const c of categories) {
  CAT_BY_NAME.set(c.name, c);
  CAT_BY_SLUG.set(slugify(c.name), c);
  if (c.subcategories?.length) {
    SUB_BY_CAT_NAME.set(c.name, c.subcategories);
    for (const s of c.subcategories) {
      SUB_BY_CAT_SLUG_AND_SUB_SLUG.set(`${slugify(c.name)}/${slugify(s.name)}`, s);
    }
  } else {
    SUB_BY_CAT_NAME.set(c.name, []);
  }
}

/* ------------------------------------------------------------------ */
/* ----------------------------- Helpers ----------------------------- */
/* ------------------------------------------------------------------ */

/** List top-level category names (sorted). */
export function listCategories(): string[] {
  return [...CAT_BY_NAME.keys()].sort((a, b) => a.localeCompare(b));
}

/** Get subcategories for a category (by name, case-insensitive). */
export function listSubcategories(category?: string): string[] {
  if (!category) return [];
  const found =
    CAT_BY_NAME.get(category) ||
    CAT_BY_SLUG.get(slugify(category)) ||
    [...CAT_BY_NAME.values()].find((c) => ciEq(c.name, category));
  return (found?.subcategories || []).map((s) => s.name);
}

/** Get sub-subcategories for category+subcategory combo. */
export function listSubsubcategories(category?: string, subcategory?: string): string[] {
  if (!category || !subcategory) return [];
  const key = `${slugify(category)}/${slugify(subcategory)}`;
  const sub = SUB_BY_CAT_SLUG_AND_SUB_SLUG.get(key);
  return sub?.subsubcategories || [];
}

/** Validate and "snap" a selection to the catalog (returns best-effort correction). */
export function ensureValidSelection(path: CategoryPath): Required<CategoryPath> {
  // 1) category
  const cat =
    CAT_BY_NAME.get(path.category || "") ||
    CAT_BY_SLUG.get(slugify(path.category || "")) ||
    // fallback: first category
    categories[0];

  // 2) subcategory
  const subs = cat.subcategories || [];
  const sub =
    subs.find((s) => ciEq(s.name, path.subcategory)) ||
    subs.find((s) => slugify(s.name) === slugify(path.subcategory || "")) ||
    subs[0];

  // 3) sub-subcategory
  const subsubs = sub?.subsubcategories || [];
  const subsub =
    subsubs.find((n) => ciEq(n, path.subsubcategory)) ||
    subsubs.find((n) => slugify(n) === slugify(path.subsubcategory || "")) ||
    subsubs[0];

  return {
    category: cat.name,
    subcategory: sub?.name,
    subsubcategory: subsub,
  };
}

/** Find path by exact names (case-insensitive). */
export function findPathByNames(
  category?: string,
  subcategory?: string,
  subsubcategory?: string
): CategoryPath | null {
  if (!category) return null;
  const cat =
    CAT_BY_NAME.get(category) ||
    [...CAT_BY_NAME.values()].find((c) => ciEq(c.name, category));
  if (!cat) return null;

  if (!subcategory) return { category: cat.name };
  const sub = (cat.subcategories || []).find((s) => ciEq(s.name, subcategory));
  if (!sub) return { category: cat.name };

  if (!subsubcategory) return { category: cat.name, subcategory: sub.name };
  const subsub = (sub.subsubcategories || []).find((n) => ciEq(n, subsubcategory));
  return { category: cat.name, subcategory: sub.name, subsubcategory: subsub || undefined };
}

/** Find path by slugs: /:cat/:sub/:subsub (any may be omitted). */
export function findPathBySlugs(
  catSlug?: string,
  subSlug?: string,
  subsubSlug?: string
): CategoryPath | null {
  if (!catSlug) return null;
  const cat = CAT_BY_SLUG.get(catSlug);
  if (!cat) return null;

  if (!subSlug) return { category: cat.name };
  const key = `${catSlug}/${subSlug}`;
  const sub = SUB_BY_CAT_SLUG_AND_SUB_SLUG.get(key);
  if (!sub) return { category: cat.name };

  if (!subsubSlug) return { category: cat.name, subcategory: sub.name };
  const subsub = (sub.subsubcategories || []).find((n) => slugify(n) === subsubSlug);
  return { category: cat.name, subcategory: sub.name, subsubcategory: subsub || undefined };
}

/** Build breadcrumb labels + slugs for a path. */
export function breadcrumbs(path: CategoryPath): { label: string; slug: string }[] {
  const snap = ensureValidSelection(path);
  const catSlug = slugify(snap.category);
  const subSlug = snap.subcategory ? slugify(snap.subcategory) : undefined;
  const subsubSlug = snap.subsubcategory ? slugify(snap.subsubcategory) : undefined;

  const crumbs: { label: string; slug: string }[] = [{ label: snap.category, slug: `/${catSlug}` }];
  if (subSlug) crumbs.push({ label: snap.subcategory!, slug: `/${catSlug}/${subSlug}` });
  if (subsubSlug) crumbs.push({ label: snap.subsubcategory!, slug: `/${catSlug}/${subSlug}/${subsubSlug}` });
  return crumbs;
}

/** Fuzzy search over category/subcategory names. Returns ranked suggestions. */
export function suggestCategories(query: string, limit = 8): string[] {
  const q = (query || "").trim();
  if (!q) return [];
  const pool: string[] = [];
  for (const c of categories) {
    pool.push(c.name);
    for (const s of c.subcategories || []) {
      pool.push(`${c.name} • ${s.name}`);
    }
  }
  const ranked = pool
    .map((label) => ({
      label,
      score: ciEq(label, q) ? 100 : ciIn(label, q) ? 50 : 0,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((x) => x.label);
  return ranked;
}

/* ------------------------------------------------------------------ */
/* --------------------------- UI Utilities -------------------------- */
/* ------------------------------------------------------------------ */

export function categoryOptions() {
  return listCategories().map((name) => ({ label: name, value: name }));
}

export function subcategoryOptions(category?: string) {
  return listSubcategories(category).map((name) => ({ label: name, value: name }));
}

export function subsubcategoryOptions(category?: string, subcategory?: string) {
  return listSubsubcategories(category, subcategory).map((name) => ({ label: name, value: name }));
}

/** Flattened list useful for search filters/autocomplete. */
export function flattenedPaths(): { category: string; subcategory?: string; subsubcategory?: string }[] {
  const out: { category: string; subcategory?: string; subsubcategory?: string }[] = [];
  for (const c of categories) {
    if (!c.subcategories?.length) {
      out.push({ category: c.name });
      continue;
    }
    for (const s of c.subcategories) {
      if (!s.subsubcategories?.length) {
        out.push({ category: c.name, subcategory: s.name });
        continue;
      }
      for (const ss of s.subsubcategories) {
        out.push({ category: c.name, subcategory: s.name, subsubcategory: ss });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ------------------------ Sensible Defaults ------------------------ */
/* ------------------------------------------------------------------ */

export const DEFAULT_CATEGORY = categories[0]?.name || "Electronics";
export const DEFAULT_SUBCATEGORY = categories[0]?.subcategories?.[0]?.name || "Phones & Tablets";
