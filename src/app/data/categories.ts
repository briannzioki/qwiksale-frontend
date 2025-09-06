// src/app/data/categories.ts

/* ============================================================================
  QwikSale · Categories Catalog (typed, indexed, and utilities)
  - Broad structural typing to avoid literal-union brittleness
  - Index maps + helpers + fuzzy suggestion
============================================================================ */

export interface CategoryNode {
  name: string;
  subcategories?: {
    name: string;
    subsubcategories?: readonly string[];
  }[];
}

export type CategoryPath = {
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
};

/* ------------------------------- Catalog ---------------------------------- */

export const categories = [
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
        subsubcategories: ["Laptops", "Desktops", "Monitors", "Computer Accessories", "Printers & Scanners"],
      },
      {
        name: "Home Appliances",
        subsubcategories: ["Televisions", "Sound Systems", "Refrigerators", "Cookers & Ovens", "Washing Machines", "Microwaves"],
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
      { name: "Vehicle Parts & Accessories", subsubcategories: ["Tyres & Rims", "Batteries", "Engines & Gearboxes", "Car Electronics"] },
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
      { name: "Musical Instruments", subsubcategories: ["Guitars", "Keyboards", "DJ Equipment", "Accessories"] },
    ],
  },
  {
    name: "Kids & Babies",
    subcategories: [{ name: "Baby Gear" }, { name: "Toys" }, { name: "Kids Clothing" }],
  },
  {
    name: "Others",
    subcategories: [{ name: "Books" }, { name: "Stationery" }, { name: "Arts & Crafts" }, { name: "Miscellaneous" }],
  },
] as const satisfies readonly CategoryNode[];

/* ------------------------------ Broad types ------------------------------- */
type AnyCat = { name: string; subcategories?: readonly AnySub[] };
type AnySub = { name: string; subsubcategories?: readonly string[] };

/* ------------------------------- Utilities -------------------------------- */

const toAscii = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

export function slugify(input: string): string {
  return toAscii(input)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const ciEq = (a?: string, b?: string) => (a || "").toLocaleLowerCase() === (b || "").toLocaleLowerCase();

/* ------------------------------- Index maps ------------------------------- */

const CAT_BY_NAME = new Map<string, AnyCat>();
const CAT_BY_SLUG = new Map<string, AnyCat>();
const SUBS_BY_CAT = new Map<string, readonly AnySub[]>();
const SUB_BY_PAIR = new Map<string, AnySub>(); // key: `${catSlug}/${subSlug}`

for (const c of categories as readonly AnyCat[]) {
  CAT_BY_NAME.set(c.name, c);
  CAT_BY_SLUG.set(slugify(c.name), c);

  const subs = c.subcategories ?? [];
  SUBS_BY_CAT.set(c.name, subs);

  for (const s of subs) {
    SUB_BY_PAIR.set(`${slugify(c.name)}/${slugify(s.name)}`, s);
  }
}

/* --------------------------------- API ------------------------------------ */

export function listCategories(): string[] {
  return [...CAT_BY_NAME.keys()].sort((a, b) => a.localeCompare(b));
}

export function listSubcategories(category?: string): string[] {
  if (!category) return [];
  const found =
    CAT_BY_NAME.get(category) ||
    CAT_BY_SLUG.get(slugify(category)) ||
    [...CAT_BY_NAME.values()].find((c) => ciEq(c.name, category));
  return (found?.subcategories ?? []).map((s) => s.name);
}

export function listSubsubcategories(category?: string, subcategory?: string): string[] {
  if (!category || !subcategory) return [];
  const key = `${slugify(category)}/${slugify(subcategory)}`;
  const sub = SUB_BY_PAIR.get(key);
  return sub?.subsubcategories ? [...sub.subsubcategories] : [];
}

/**
 * Normalize a possibly-partial path to a safe path.
 * Returns only keys that are actually present (never `undefined` values),
 * so it plays nice with `exactOptionalPropertyTypes`.
 */
export function ensureValidSelection(path: CategoryPath): CategoryPath {
  const cat =
    CAT_BY_NAME.get(path.category ?? "") ||
    CAT_BY_SLUG.get(slugify(path.category ?? "")) ||
    (categories[0] as AnyCat);

  const subs = SUBS_BY_CAT.get(cat.name) ?? [];
  const sub =
    subs.find((s) => ciEq(s.name, path.subcategory)) ||
    subs.find((s) => slugify(s.name) === slugify(path.subcategory ?? "")) ||
    subs[0];

  const subsubs = sub?.subsubcategories ?? [];
  const subsub =
    subsubs.find((n) => ciEq(n, path.subsubcategory)) ||
    subsubs.find((n) => slugify(n) === slugify(path.subsubcategory ?? "")) ||
    subsubs[0];

  const out: CategoryPath = { category: cat.name };
  if (sub?.name) out.subcategory = sub.name;
  if (subsub) out.subsubcategory = subsub;
  return out;
}

export function findPathByNames(
  category?: string,
  subcategory?: string,
  subsubcategory?: string
): CategoryPath | null {
  if (!category) return null;
  const cat = CAT_BY_NAME.get(category) ?? [...CAT_BY_NAME.values()].find((c) => ciEq(c.name, category));
  if (!cat) return null;

  if (!subcategory) return { category: cat.name };
  const sub = (cat.subcategories ?? []).find((s) => ciEq(s.name, subcategory));
  if (!sub) return { category: cat.name };

  if (!subsubcategory) return { category: cat.name, subcategory: sub.name };
  const subsub = (sub.subsubcategories ?? []).find((n) => ciEq(n, subsubcategory));
  return subsub
    ? { category: cat.name, subcategory: sub.name, subsubcategory: subsub }
    : { category: cat.name, subcategory: sub.name };
}

export function findPathBySlugs(catSlug?: string, subSlug?: string, subsubSlug?: string): CategoryPath | null {
  if (!catSlug) return null;
  const cat = CAT_BY_SLUG.get(catSlug);
  if (!cat) return null;

  if (!subSlug) return { category: cat.name };
  const pair = SUB_BY_PAIR.get(`${catSlug}/${subSlug}`);
  if (!pair) return { category: cat.name };

  if (!subsubSlug) return { category: cat.name, subcategory: pair.name };
  const subsub = (pair.subsubcategories ?? []).find((n) => slugify(n) === subsubSlug);
  return subsub
    ? { category: cat.name, subcategory: pair.name, subsubcategory: subsub }
    : { category: cat.name, subcategory: pair.name };
}

export function breadcrumbs(path: CategoryPath): { label: string; slug: string }[] {
  const snap = ensureValidSelection(path);
  const catSlug = slugify(snap.category!);
  const subSlug = snap.subcategory ? slugify(snap.subcategory) : undefined;
  const subsubSlug = snap.subsubcategory ? slugify(snap.subsubcategory) : undefined;

  const crumbs: { label: string; slug: string }[] = [{ label: snap.category!, slug: `/${catSlug}` }];
  if (snap.subcategory && subSlug) crumbs.push({ label: snap.subcategory, slug: `/${catSlug}/${subSlug}` });
  if (snap.subsubcategory && subSlug && subsubSlug)
    crumbs.push({ label: snap.subsubcategory, slug: `/${catSlug}/${subSlug}/${subsubSlug}` });
  return crumbs;
}

/** Token-aware fuzzy suggestions (category and "Category • Subcategory"). */
export function suggestCategories(query: string, limit = 8): string[] {
  const q = (query || "").trim();
  if (!q) return [];

  // Ensure tokens is string[] (not (string | undefined)[])
  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .filter((s): s is string => Boolean(s));

  const pool: string[] = [];
  for (const c of categories as readonly AnyCat[]) {
    pool.push(c.name);
    for (const s of c.subcategories ?? []) {
      pool.push(`${c.name} • ${s.name}`);
    }
  }

  const rank = (label: string) => {
    const lower = label.toLowerCase();
    if (lower === q.toLowerCase()) return 1000; // exact

    const firstTok = tokens[0];
    const starts = firstTok && lower.startsWith(firstTok) ? 250 : 0;

    const covered = tokens.every((t) => lower.includes(t));
    if (!covered) return -1;

    const brevity = Math.max(0, 120 - lower.length);
    return 300 + starts + brevity;
  };

  return pool
    .map((label) => ({ label, score: rank(label) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((x) => x.label);
}

/* ----------------------------- UI conveniences ---------------------------- */

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
  for (const c of categories as readonly AnyCat[]) {
    const subs = c.subcategories ?? [];
    if (!subs.length) {
      out.push({ category: c.name });
      continue;
    }
    for (const s of subs) {
      const subsubs = s.subsubcategories ?? [];
      if (!subsubs.length) {
        out.push({ category: c.name, subcategory: s.name });
        continue;
      }
      for (const ss of subsubs) {
        out.push({ category: c.name, subcategory: s.name, subsubcategory: ss });
      }
    }
  }
  return out;
}

/* --------------------------- Sensible defaults ---------------------------- */

export const DEFAULT_CATEGORY: string = categories[0]?.name ?? "Electronics";
export const DEFAULT_SUBCATEGORY: string = categories[0]?.subcategories?.[0]?.name ?? "Phones & Tablets";

/* -------------------------- Optional map exports -------------------------- */
export const CategoryMaps = {
  byName: CAT_BY_NAME,
  bySlug: CAT_BY_SLUG,
  subsByCat: SUBS_BY_CAT,
  subByPair: SUB_BY_PAIR,
} as const;
