"use client";
// src/app/components/Card.tsx

import * as React from "react";

/** Visual variants for the card surface */
type Variant = "solid" | "subtle" | "ghost" | "glass";

/** Padding presets for the body area */
type Padding = "none" | "sm" | "md" | "lg";

type BaseProps = {
  variant?: Variant;
  hover?: boolean;        // lift on hover if true (default auto when clickable)
  clickable?: boolean;    // applies focus ring + hover-lift + cursor
  padding?: Padding;      // padding on Card.Body if you don't pass your own classes
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;     // dims and removes pointer events
  as?: "div" | "a" | "button"; // simple polymorphism without extra deps
  href?: string;          // used when as="a"
  onClick?: React.MouseEventHandler<any>;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/** Surface classes per variant, tuned to our global tokens */
const surface: Record<Variant, string> = {
  solid:
    "bg-[var(--bg-elevated)] border border-[var(--border)] shadow-card",
  subtle:
    "bg-white/80 dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm",
  ghost:
    "bg-transparent border border-black/5 dark:border-white/10 shadow-none",
  glass:
    // uses globals: .glass gives blur + light border; keep our rounding/shadow too
    "glass shadow-sm",
};

const base =
  "rounded-2xl transition will-change-transform " +
  "text-gray-900 dark:text-slate-100";

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
    ref
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
            "cursor-pointer focus:outline-none ring-offset-2 ring-offset-white dark:ring-offset-slate-900 focus-visible:ring-2 ring-focus",
          disabled && "opacity-60 pointer-events-none",
          className
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
  }
);
CardRoot.displayName = "Card";

const bodyPadding: Record<Padding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 md:p-5",
  lg: "p-6 md:p-8",
};

/** Header / Body / Footer to compose neatly */
type SectionProps = React.HTMLAttributes<HTMLDivElement> & { padding?: Padding };

const CardHeader = React.forwardRef<HTMLDivElement, SectionProps>(
  ({ className, padding = "md", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-3 border-b border-black/5 dark:border-white/10",
        bodyPadding[padding],
        className
      )}
      {...props}
    />
  )
);
CardHeader.displayName = "Card.Header";

const CardBody = React.forwardRef<HTMLDivElement, SectionProps>(
  ({ className, padding = "md", ...props }, ref) => (
    <div ref={ref} className={cn(bodyPadding[padding], className)} {...props} />
  )
);
CardBody.displayName = "Card.Body";

const CardFooter = React.forwardRef<HTMLDivElement, SectionProps>(
  ({ className, padding = "md", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-3 border-t border-black/5 dark:border-white/10",
        bodyPadding[padding],
        className
      )}
      {...props}
    />
  )
);
CardFooter.displayName = "Card.Footer";

/** Media slot with a gentle radius that matches container */
type MediaProps = React.ImgHTMLAttributes<HTMLImageElement> & { aspect?: string };
const CardMedia = React.forwardRef<HTMLImageElement, MediaProps>(
  ({ className, aspect, ...props }, ref) => (
    <div className={cn("overflow-hidden rounded-2xl", aspect && `aspect-${aspect}`)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} className={cn("w-full h-auto object-cover", className)} {...props} />
    </div>
  )
);
CardMedia.displayName = "Card.Media";

const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
  Media: CardMedia,
});

export default Card;
