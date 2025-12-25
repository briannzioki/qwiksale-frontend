"use client";
// src/app/components/Card.tsx

import * as React from "react";

/** Visual variants for the card surface */
type Variant = "solid" | "subtle" | "ghost" | "glass";

/** Padding presets for the body area */
type Padding = "none" | "sm" | "md" | "lg";

type BaseProps = {
  variant?: Variant;
  hover?: boolean; // lift on hover if true (default auto when clickable)
  clickable?: boolean; // applies focus ring + hover-lift + cursor
  padding?: Padding; // padding on Card.Body if you don't pass your own classes
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean; // dims and removes pointer events
  as?: "div" | "a" | "button"; // simple polymorphism without extra deps
  href?: string; // used when as="a"
  onClick?: React.MouseEventHandler<any>;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/** Surface classes per variant, tuned to our global tokens */
const surface: Record<Variant, string> = {
  solid: "bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-soft",
  subtle: "bg-[var(--bg-subtle)] border border-[var(--border-subtle)] shadow-soft",
  ghost: "bg-transparent border border-[var(--border-subtle)] shadow-none",
  glass:
    // uses globals: .glass gives blur + light border; keep our rounding/shadow too
    "glass shadow-soft",
};

const base = "rounded-2xl transition will-change-transform text-[var(--text)]";

const bodyPadding: Record<Padding, string> = {
  none: "",
  // ✅ phone-first: tighter on xs, restore on sm+
  sm: "p-2.5 sm:p-3",
  // ✅ default cards: p-2.5 on phones, restore spacing on sm/md for desktop/tablet
  md: "p-2.5 sm:p-4 md:p-5",
  // ✅ detail cards: still tighter on phones
  lg: "p-4 sm:p-6 md:p-8",
};

/** Outer wrapper */
const CardRoot = React.forwardRef<HTMLElement, BaseProps>(
  (
    {
      variant = "solid",
      hover,
      clickable = false,
      padding = "md",
      className,
      children,
      disabled = false,
      as = "div",
      href,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const Comp: any = as;
    const isInteractive = clickable || as === "a" || as === "button" || !!onClick;
    const lift = hover ?? isInteractive;

    return (
      <Comp
        ref={ref as any}
        href={as === "a" ? href : undefined}
        onClick={onClick}
        aria-disabled={disabled ? "true" : undefined}
        className={cn(
          base,
          surface[variant],
          // lift when interactive
          lift && "hover:-translate-y-[1px] hover:shadow-soft",
          isInteractive &&
            [
              "cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
              "active:scale-[.99]",
            ].join(" "),
          disabled && "opacity-60 pointer-events-none",
          className,
        )}
        {...rest}
      >
        {/* Default padding if user doesn't provide a <Card.Body> */}
        {typeof children === "string" || typeof children === "number" ? (
          <div className={bodyPadding[padding]}>{children}</div>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
CardRoot.displayName = "Card";

/** Header / Body / Footer to compose neatly */
type SectionProps = React.HTMLAttributes<HTMLDivElement> & {
  padding?: Padding;
};

const CardHeader = React.forwardRef<HTMLDivElement, SectionProps>(
  ({ className, padding = "md", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2 sm:gap-3 border-b border-[var(--border-subtle)]",
        bodyPadding[padding],
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = "Card.Header";

const CardBody = React.forwardRef<HTMLDivElement, SectionProps>(
  ({ className, padding = "md", ...props }, ref) => (
    <div ref={ref} className={cn(bodyPadding[padding], className)} {...props} />
  ),
);
CardBody.displayName = "Card.Body";

const CardFooter = React.forwardRef<HTMLDivElement, SectionProps>(
  ({ className, padding = "md", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2 sm:gap-3 border-t border-[var(--border-subtle)]",
        bodyPadding[padding],
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = "Card.Footer";

/** Media slot with a gentle radius that matches container */
type MediaProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  aspect?: string;
};

function normalizeAspect(aspect?: string) {
  const a = (aspect ?? "").trim();
  if (!a) return undefined;
  if (a === "video") return "16 / 9";
  if (a === "square") return "1 / 1";
  if (a.includes("/")) return a.replace(/\s*\/\s*/g, " / ");
  return a;
}

const CardMedia = React.forwardRef<HTMLImageElement, MediaProps>(({ className, aspect, ...props }, ref) => {
  const ar = normalizeAspect(aspect);

  return (
    <div className={cn("overflow-hidden rounded-2xl")} {...(ar ? { style: { aspectRatio: ar } as React.CSSProperties } : {})}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        className={cn("w-full object-cover", ar ? "h-full" : "h-auto", className)}
        {...props}
      />
    </div>
  );
});
CardMedia.displayName = "Card.Media";

const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
  Media: CardMedia,
});

export default Card;
