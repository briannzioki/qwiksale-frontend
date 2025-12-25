"use client";
// src/app/components/FacetBar.tsx

type Facet = { value: string; count: number };
export type Facets = {
  categories?: Facet[];
  brands?: Facet[];
  conditions?: Facet[];
};

type Props = {
  facets?: Facets | null;
  onPickAction?: (
    kind: "category" | "brand" | "condition",
    value: string,
  ) => void | Promise<void>;
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

/** Robust slug: don't call .replace on the result of optional .normalize() */
function slug(input: string) {
  const base = (input || "").toLowerCase();
  const normalized =
    typeof (base as any).normalize === "function"
      ? base.normalize("NFKD")
      : base;
  return normalized
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
  maxPerSection = 10,
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

    // Sort by count desc so "Top" really means top
    const top = Array.from(dedupMap.values())
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, limit);

    async function pick(value: string) {
      emit("qs:facet:pick", { kind, value });
      try {
        await onPickAction?.(kind, value);
      } catch {
        /* swallow optional handler errors */
      }
    }

    return (
      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] sm:mb-2 sm:text-xs">
          {title}
        </h3>

        {/* xs: horizontal scroll strip; sm+: wraps normally */}
        <ul
          className={[
            "flex gap-2",
            "-mx-1 overflow-x-auto px-1 pb-1 pr-2",
            "[-webkit-overflow-scrolling:touch]",
            "sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 sm:pr-0",
          ].join(" ")}
          role="list"
        >
          {top.map((f) => {
            const value = f.value ?? "";
            const key = `${kind}:${slug(value) || value}`;
            const countTxt = nf.format(f.count ?? 0);
            const label = `${title}: ${value} (${countTxt})`;

            return (
              <li key={key} className="shrink-0 sm:shrink">
                <button
                  type="button"
                  onClick={() => pick(value)}
                  className={[
                    "inline-flex min-h-9 items-center gap-2",
                    "rounded-xl px-2 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-sm",
                    "bg-[var(--bg-subtle)] text-[var(--text)]",
                    "border border-[var(--border-subtle)]",
                    "transition",
                    "hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]",
                    "active:scale-[.99]",
                    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  ].join(" ")}
                  title={label}
                  aria-label={label}
                >
                  <span className="max-w-[10rem] truncate sm:max-w-[12rem]">
                    {value}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] sm:text-xs">
                    {countTxt}
                  </span>
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
      className={[
        "w-full rounded-2xl",
        "bg-[var(--bg-elevated)]",
        "border border-[var(--border-subtle)]",
        "shadow-sm",
        "p-3 sm:p-4 md:p-5",
        className,
      ].join(" ")}
    >
      <div className="grid gap-4 sm:gap-6 md:grid-cols-3 md:gap-5">
        <Section
          title="Top Categories"
          items={facets?.categories ?? []}
          kind="category"
        />
        <Section title="Top Brands" items={facets?.brands ?? []} kind="brand" />
        <Section
          title="Condition"
          items={facets?.conditions ?? []}
          kind="condition"
        />
      </div>
    </section>
  );
}
