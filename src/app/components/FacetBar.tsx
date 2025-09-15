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

  /**
   * Optional callback when a chip is clicked.
   * Rename ends with "Action" to satisfy Next.js 15 serialization rules if passed from a Server Component.
   * You can also skip this and just listen to the client event "qs:facet:pick".
   */
  onPickAction?: (
    kind: "category" | "brand" | "condition",
    value: string
  ) => void | Promise<void>;

  className?: string;

  /** Maximum chips per section (default 12) */
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
  // eslint-disable-next-line no-console
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function slug(s: string) {
  return s
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
  maxPerSection = 12,
}: Props) {
  // If nothing to show, render nothing (prevents blank white area)
  if (!hasAnyFacets(facets)) return null;

  // Defensive clamp on per-section limit
  const limit = Number.isFinite(maxPerSection)
    ? Math.max(0, Math.floor(maxPerSection))
    : 12;

  const Section = ({
    title,
    items,
    kind,
  }: {
    title: string;
    items: Facet[]; // required; callers pass [] if empty
    kind: "category" | "brand" | "condition";
  }) => {
    if (!items.length) return null;

    // Deduplicate by value (case-insensitive), keep highest count if duplicates arrive
    const dedupMap = new Map<string, Facet>();
    for (const it of items) {
      const key = it.value.toLowerCase();
      const prev = dedupMap.get(key);
      if (!prev || (prev?.count ?? 0) < (it?.count ?? 0)) {
        dedupMap.set(key, it);
      }
    }
    const deduped = Array.from(dedupMap.values());

    // Slice after dedupe
    const top = deduped.slice(0, limit);

    async function pick(value: string) {
      emit("qs:facet:pick", { kind, value });
      try {
        await onPickAction?.(kind, value);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[FacetBar] onPickAction error:", e);
      }
    }

    return (
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          {title}
        </h3>
        <ul className="flex flex-wrap gap-2" role="list">
          {top.map((f) => {
            const key = `${kind}:${slug(f.value) || f.value}`;
            const label = `${title}: ${f.value} (${f.count})`;
            const countTxt = nf.format(f.count);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => pick(f.value)}
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
                  <span className="truncate max-w-[12rem]">{f.value}</span>
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
