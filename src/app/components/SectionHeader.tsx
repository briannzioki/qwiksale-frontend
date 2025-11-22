"use client";

import * as React from "react";
import { createPortal } from "react-dom";

type Align = "left" | "center";
type Gradient = "brand" | "navy" | "blue" | "none";
type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div";

export type SectionHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  kicker?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode | React.ReactNode[];

  align?: Align;
  gradient?: Gradient;
  dense?: boolean;
  className?: string;

  portalActionsToLayout?: boolean;

  /** Heading element to render for the title. Defaults to "h1". */
  as?: HeadingTag;

  /**
   * When `as="div"`, controls whether we add ARIA heading semantics.
   * Default: true. Set false to render a plain container.
   */
  semanticHeading?: boolean;

  /** Accessible heading level when `as="div"` + `semanticHeading` is true. */
  level?: 1 | 2 | 3 | 4 | 5 | 6;

  "data-testid"?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">;

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const stripByGradient: Record<Exclude<Gradient, "none">, string> = {
  brand: "bg-spotlight bg-noise text-white",
  navy: "text-white shadow-soft",
  blue: "text-white shadow-soft",
};

const stripInlineByGradient: Partial<Record<Gradient, React.CSSProperties>> = {
  navy: {
    backgroundImage:
      "linear-gradient(90deg, #161748 0%, #1f2a6b 60%, #2b3a8a 100%)",
  },
  blue: {
    backgroundImage: "linear-gradient(90deg, #0b5fad 0%, #39a0ca 100%)",
  },
};

export default function SectionHeader({
  title,
  subtitle,
  kicker,
  icon,
  actions,
  align = "left",
  gradient = "brand",
  dense = false,
  className,
  portalActionsToLayout = false,
  as = "h1",
  semanticHeading = true,
  level,
  ...rest
}: SectionHeaderProps) {
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!portalActionsToLayout) return;
    setPortalEl(document.getElementById("page-header-actions"));
  }, [portalActionsToLayout]);

  const useStrip = gradient !== "none";
  const HeadingTag = (as || "h1") as React.ElementType;

  const ariaLevel =
    as === "div"
      ? (level ?? 1)
      : ((Number(String(as).slice(1)) as 1 | 2 | 3 | 4 | 5 | 6) || 1);

  const headingRoleProps =
    as === "div" && semanticHeading
      ? ({ role: "heading", "aria-level": ariaLevel } as const)
      : ({} as const);

  const headingTitleAttr = typeof title === "string" ? title : undefined;

  const actionsArray = React.Children.toArray(actions);

  // Special-case: home hero “Welcome / QwikSale” → brighter brand gradient text
  const isHomeHero =
    kicker === "Welcome" &&
    typeof title === "string" &&
    title.trim().toLowerCase() === "qwiksale";

  const baseColorClass = useStrip
    ? "text-white"
    : "text-gray-900 dark:text-slate-100";

  const titleColorClass = isHomeHero
    ? "bg-gradient-to-r from-[#f9fafb] via-[#7dd3fc] to-[#6ee7b7] bg-clip-text text-transparent"
    : baseColorClass;

  return (
    <header
      {...rest}
      className={cn(useStrip && "relative isolate", className)}
      style={
        useStrip
          ? {
              WebkitMaskImage:
                "linear-gradient(to bottom, black 85%, transparent)",
            }
          : undefined
      }
    >
      <div
        className={cn(
          useStrip
            ? cn(
                stripByGradient[gradient as Exclude<Gradient, "none">] ??
                  stripByGradient.brand,
                "w-full",
              )
            : "w-full",
          dense ? "pt-4 pb-6 md:pt-5 md:pb-7" : "pt-8 pb-12 md:pt-10 md:pb-14",
        )}
        style={stripInlineByGradient[gradient]}
      >
        <div className="container-page">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            {/* Left: title block */}
            <div
              className={cn(
                "min-w-0",
                align === "center" &&
                  "md:mx-auto md:text-center md:items-center md:justify-center",
              )}
            >
              {(kicker || icon) && (
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs md:text-sm",
                    useStrip
                      ? "text-white/90"
                      : "text-gray-600 dark:text-slate-400",
                    align === "center" ? "justify-center" : "",
                  )}
                >
                  {icon ? <span aria-hidden>{icon}</span> : null}
                  {kicker ? <span className="truncate">{kicker}</span> : null}
                </div>
              )}

              {/* Title (may be div or real heading) */}
              <HeadingTag
                {...headingRoleProps}
                className={cn(
                  "text-balance font-extrabold tracking-tight",
                  dense ? "text-xl md:text-2xl" : "text-2xl md:text-3xl",
                  titleColorClass,
                  !useStrip && !isHomeHero && "text-gradient",
                )}
                title={headingTitleAttr}
              >
                {title}
              </HeadingTag>

              {subtitle ? (
                <p
                  className={cn(
                    "mt-1 max-w-2xl text-sm md:text-base",
                    useStrip
                      ? "text-white/80"
                      : "text-gray-600 dark:text-slate-400",
                    align === "center" ? "mx-auto" : "",
                  )}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>

            {/* Right: actions */}
            <div
              className={cn(
                "mt-2 md:mt-0",
                align === "center" ? "md:mx-auto" : "",
              )}
            >
              {portalActionsToLayout && portalEl
                ? createPortal(
                    <div className="flex items-center gap-2">
                      {actionsArray}
                    </div>,
                    portalEl,
                  )
                : (
                  <div className="flex items-center gap-2">
                    {actionsArray}
                  </div>
                  )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
