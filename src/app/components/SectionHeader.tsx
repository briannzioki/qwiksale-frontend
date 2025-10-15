// src/app/components/SectionHeader.tsx
"use client";

import * as React from "react";
import { createPortal } from "react-dom";

type Align = "left" | "center";
type Gradient = "brand" | "navy" | "blue" | "none";

export type SectionHeaderProps = {
  /** Main title (string or node) */
  title: React.ReactNode;
  /** Optional subtitle/description */
  subtitle?: React.ReactNode;
  /** Small kicker/eyebrow above the title (e.g., “Dashboard” or a <Badge/>) */
  kicker?: React.ReactNode;
  /** Optional leading icon/avatar */
  icon?: React.ReactNode;
  /** Primary actions (buttons, etc.) */
  actions?: React.ReactNode;

  /** Align text/content */
  align?: Align;
  /** Gradient style for the strip */
  gradient?: Gradient;
  /** Make header more compact */
  dense?: boolean;
  /** Extra class on outer wrapper */
  className?: string;

  /**
   * If true, renders actions into the layout’s #page-header-actions portal
   * so the buttons land on the right side of the global header strip.
   */
  portalActionsToLayout?: boolean;

  /** Test id */
  "data-testid"?: string;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const stripByGradient: Record<Exclude<Gradient, "none">, string> = {
  brand:
    // uses your spotlight + noise base; text stays white inside the strip
    "bg-spotlight bg-noise text-white",
  navy: "text-white shadow-soft",
  blue: "text-white shadow-soft",
};

const stripInlineByGradient: Partial<Record<Gradient, React.CSSProperties>> = {
  navy: {
    backgroundImage: "linear-gradient(90deg, #161748 0%, #1f2a6b 60%, #2b3a8a 100%)",
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
  ...rest
}: SectionHeaderProps) {
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!portalActionsToLayout) return;
    setPortalEl(document.getElementById("page-header-actions"));
  }, [portalActionsToLayout]);

  // Whether we want the fancy gradient strip or a plain container
  const useStrip = gradient !== "none";

  return (
    <header
      {...rest}
      className={cn(
        // keep spotlight bleed visible (matches layout)
        useStrip && "relative isolate",
        className
      )}
      // Do not clip spotlight; fade bottom to content
      style={
        useStrip
          ? { WebkitMaskImage: "linear-gradient(to bottom, black 85%, transparent)" }
          : undefined
      }
    >
      <div
        className={cn(
          useStrip
            ? cn(
                stripByGradient[gradient as Exclude<Gradient, "none">] ??
                  stripByGradient.brand,
                "w-full"
              )
            : "w-full",
          // ⬇️ Slightly more bottom padding so sections breathe
          dense
            ? "pt-4 pb-6 md:pt-5 md:pb-7"
            : "pt-8 pb-12 md:pt-10 md:pb-14"
        )}
        style={stripInlineByGradient[gradient]}
      >
        <div className="container-page">
          <div className={cn("flex flex-col gap-3 md:flex-row md:items-end md:justify-between")}>
            {/* Left: title block */}
            <div
              className={cn(
                "min-w-0", // allow truncation
                align === "center" &&
                  "md:mx-auto md:text-center md:items-center md:justify-center"
              )}
            >
              {/* kicker / icon row */}
              {(kicker || icon) && (
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs md:text-sm",
                    useStrip ? "text-white/90" : "text-gray-600 dark:text-slate-400",
                    align === "center" ? "justify-center" : ""
                  )}
                >
                  {icon ? <span aria-hidden>{icon}</span> : null}
                  {kicker ? <span className="truncate">{kicker}</span> : null}
                </div>
              )}

              {/* title */}
              <h1
                className={cn(
                  "text-balance font-extrabold tracking-tight",
                  // size
                  dense ? "text-xl md:text-2xl" : "text-2xl md:text-3xl",
                  // color treatment
                  useStrip ? "text-white" : "text-gray-900 dark:text-slate-100",
                  // gradient text when not in strip
                  !useStrip && "text-gradient"
                )}
                title={typeof title === "string" ? title : undefined}
              >
                {title}
              </h1>

              {/* subtitle */}
              {subtitle ? (
                <p
                  className={cn(
                    "mt-1 max-w-2xl text-sm md:text-base",
                    useStrip ? "text-white/80" : "text-gray-600 dark:text-slate-400",
                    align === "center" ? "mx-auto" : ""
                  )}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>

            {/* Right: actions (either inline or portaled to layout slot) */}
            <div className={cn("mt-2 md:mt-0", align === "center" ? "md:mx-auto" : "")}>
              {portalActionsToLayout && portalEl ? (
                createPortal(<div className="flex items-center gap-2">{actions}</div>, portalEl)
              ) : (
                <div className="flex items-center gap-2">{actions}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
