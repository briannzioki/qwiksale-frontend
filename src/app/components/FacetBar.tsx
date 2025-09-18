// src/app/components/FacetBar.tsx
"use client";

type Facet = { value: string; count: number };
export type Facets = {
  categories?: Facet[];
  brands?: Facet[];
  conditions?: Facet[];
};

type Props = {
  facets?: Facets | null;
  onPickAction?: (kind: "category" | "brand" | "condition", value: string) => void | Promise<void>;
  className?: string;
  /** Maximum chips per section (default 10) */
  maxPerSection?: number;
};

/* -------------------- helpers -------------------- */

function hasAnyFacets(f?: Facets | null) {
  if (!f) return false;
  const total =
    (f.categories?.length ?? 0) +
    (f.brands?.length ?? 0) +
    (f.conditions?.length ?? 0);
  return total > 0;
}

function emit<T = unknown>(name: string, detail?: T) {
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function slug(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize?.("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const nf = new Intl.NumberFormat("en-KE");

/* -------------------- component -------------------- */

export default function FacetBar({
  facets,
  onPickAction,
  className = "",
  maxPerSection = 10, // slightly lower default keeps DOM lighter
}: Props) {
  if (!hasAnyFacets(facets)) return null;

  const limit = Number.isFinite(maxPerSection)
    ? Math.max(0, Math.floor(maxPerSection))
    : 10;

  const Section = ({
    title,
    items,
    kind,
  }: {
    title: string;
    items: Facet[];
    kind: "category" | "brand" | "condition";
  }) => {
    if (!items.length) return null;

    // Dedupe by value (case-insensitive), keep highest count
    const dedupMap = new Map<string, Facet>();
    for (const it of items) {
      const key = (it.value || "").toLowerCase();
      const prev = dedupMap.get(key);
      if (!prev || (prev?.count ?? 0) < (it?.count ?? 0)) {
        dedupMap.set(key, it);
      }
    }
    const top = Array.from(dedupMap.values()).slice(0, limit);

    async function pick(value: string) {
      emit("qs:facet:pick", { kind, value });
      try {
        await onPickAction?.(kind, value);
      } catch (e) {
        // optional: swallow
      }
    }

    return (
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          {title}
        </h3>
        <ul className="flex flex-wrap gap-2" role="list">
          {top.map((f) => {
            const value = f.value ?? "";
            const key = `${kind}:${slug(value) || value}`;
            const countTxt = nf.format(f.count ?? 0);
            const label = `${title}: ${value} (${countTxt})`;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => pick(value)}
                  className="
                    inline-flex items-center gap-2
                    rounded-full px-3 py-1.5 text-sm
                    bg-white/70 dark:bg-white/[0.08]
                    text-gray-800 dark:text-slate-100
                    border border-black/5 dark:border-white/10
                    hover:bg-white/90 dark:hover:bg-white/[0.12]
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39a0ca]
                    transition
                  "
                  title={label}
                  aria-label={label}
                >
                  <span className="truncate max-w-[12rem]">{value}</span>
                  <span className="text-xs opacity-70">{countTxt}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <section
      aria-label="Top facets"
      className={`
        w-full rounded-2xl
        bg-white/60 dark:bg-white/[0.03]
        border border-black/5 dark:border-white/10
        shadow-sm
        p-4 md:p-5
        ${className}
      `}
    >
      <div className="grid gap-4 md:gap-5 md:grid-cols-3">
        <Section title="Top Categories" items={facets?.categories ?? []} kind="category" />
        <Section title="Top Brands" items={facets?.brands ?? []} kind="brand" />
        <Section title="Condition" items={facets?.conditions ?? []} kind="condition" />
      </div>
    </section>
  );
}
