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
   * Called when a chip is clicked. You can hook this to your router/search state.
   * Example: onPick("category", v)
   */
  onPick?: (kind: "category" | "brand" | "condition", value: string) => void;
  className?: string;
};

function hasAnyFacets(f?: Facets | null) {
  if (!f) return false;
  const total =
    (f.categories?.length ?? 0) +
    (f.brands?.length ?? 0) +
    (f.conditions?.length ?? 0);
  return total > 0;
}

export default function FacetBar({ facets, onPick, className = "" }: Props) {
  // If nothing to show, render nothing (this is the main fix for the blank white tab)
  if (!hasAnyFacets(facets)) return null;

  const Section = ({
    title,
    items,
    kind,
  }: {
    title: string;
    items?: Facet[];
    kind: "category" | "brand" | "condition";
  }) => {
    if (!items?.length) return null;
    return (
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          {title}
        </div>
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 12).map((f) => (
            <button
              key={`${kind}:${f.value}`}
              onClick={() => onPick?.(kind, f.value)}
              className="
                inline-flex items-center gap-2
                rounded-full px-3 py-1.5 text-sm
                bg-white/70 dark:bg-white/10
                text-gray-800 dark:text-slate-100
                border border-black/5 dark:border-white/10
                hover:bg-white/90 dark:hover:bg-white/15
                transition
              "
              title={`${f.value} (${f.count})`}
            >
              <span className="truncate max-w-[12rem]">{f.value}</span>
              <span className="text-xs opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
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
        <Section title="Top Categories" items={facets?.categories} kind="category" />
        <Section title="Top Brands" items={facets?.brands} kind="brand" />
        <Section title="Condition" items={facets?.conditions} kind="condition" />
      </div>
    </section>
  );
}
