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

  /** When true, actions are portalled into #page-header-actions in layout */
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

/**
 * Hero strip variants.
 * Only the approved brand gradient is used for strip backgrounds.
 */
const stripByGradient: Record<Exclude<Gradient, "none">, string> = {
  brand: "bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] shadow-soft",
  navy: "bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] shadow-soft",
  blue: "bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] shadow-soft",
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

  // ✅ Strip needs guaranteed contrast (brand gradient is dark in BOTH themes)
  const baseColorClass = useStrip ? "text-white" : "text-[var(--text)]";
  const kickerColorClass = useStrip ? "text-white/80" : "text-[var(--text-muted)]";
  const subtitleColorClass = useStrip ? "text-white/80" : "text-[var(--text-muted)]";

  // Phone-first: reduce top/bottom whitespace so content stays above the fold.
  const verticalPadding = dense
    ? "py-4 sm:py-6 md:pt-5 md:pb-7"
    : "py-4 sm:py-8 md:pt-10 md:pb-14";

  // Phone-first: tighter hero card padding; restore on larger screens.
  const cardPadding = dense ? "p-3 sm:p-4 md:px-6 md:py-6" : "p-3.5 sm:p-5 md:px-8 md:py-8";

  const alignmentClasses =
    align === "center"
      ? "md:mx-auto md:items-center md:justify-center md:text-center"
      : "";

  const inner = (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-end md:justify-between md:gap-3">
      {/* Left: title block */}
      <div className={cn("min-w-0", alignmentClasses)}>
        {(kicker || icon) && (
          <div
            className={cn(
              "flex items-center gap-2 text-[11px] sm:text-xs md:text-sm",
              kickerColorClass,
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
            dense ? "text-xl sm:text-2xl" : "text-xl min-[420px]:text-2xl md:text-3xl",
            baseColorClass,
          )}
          title={headingTitleAttr}
        >
          {title}
        </HeadingTag>

        {subtitle ? (
          <p
            className={cn(
              "mt-0.5 max-w-2xl text-[13px] leading-relaxed sm:mt-1 sm:text-sm md:text-base",
              subtitleColorClass,
              align === "center" ? "mx-auto" : "",
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {/* Right: actions */}
      <div className={cn("mt-1 md:mt-0", align === "center" ? "md:mx-auto" : "")}>
        {portalActionsToLayout && portalEl ? (
          createPortal(<div className="flex items-center gap-1.5 sm:gap-2">{actionsArray}</div>, portalEl)
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2">{actionsArray}</div>
        )}
      </div>
    </div>
  );

  return (
    <header {...rest} className={cn(className)}>
      <div className={verticalPadding}>
        <div className="container-page">
          {useStrip ? (
            <div
              className={cn(
                "relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] shadow-soft",
                "bg-[var(--bg-elevated)]",
                "text-white",
                stripByGradient[gradient as Exclude<Gradient, "none">] ?? stripByGradient.brand,
                cardPadding,
              )}
            >
              {inner}
            </div>
          ) : (
            inner
          )}
        </div>
      </div>
    </header>
  );
}
