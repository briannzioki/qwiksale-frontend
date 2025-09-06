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

/* -------------------- component -------------------- */

export default function FacetBar({
  facets,
  onPickAction,
  className = "",
  maxPerSection = 12,
}: Props) {
  // If nothing to show, render nothing (prevents blank white area)
  if (!hasAnyFacets(facets)) return null;

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

    const top = items.slice(0, Math.max(0, maxPerSection));

    async function pick(value: string) {
      emit("qs:facet:pick", { kind, value });
      try {
        await onPickAction?.(kind, value);
      } catch (e) {
        console.error("[FacetBar] onPickAction error:", e);
      }
    }

    return (
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          {title}
        </div>
        <ul className="flex flex-wrap gap-2" role="list">
          {top.map((f) => (
            <li key={`${kind}:${f.value}`}>
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
                title={`${f.value} (${f.count})`}
                aria-label={`${title}: ${f.value} (${f.count})`}
              >
                <span className="truncate max-w-[12rem]">{f.value}</span>
                <span className="text-xs opacity-70">{f.count}</span>
              </button>
            </li>
          ))}
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
        <Section title="Top Categories" items={(facets?.categories ?? [])} kind="category" />
        <Section title="Top Brands" items={(facets?.brands ?? [])} kind="brand" />
        <Section title="Condition" items={(facets?.conditions ?? [])} kind="condition" />
      </div>
    </section>
  );
}
