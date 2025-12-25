"use client";
// src/app/components/Icon.tsx

import * as React from "react";
import type { LucideProps } from "lucide-react";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Heart,
  Share2,
  Phone,
  MessageCircle,
  MapPin,
  CheckCircle2,
  XCircle,
  Info,
  ShieldCheck,
  AlertTriangle,
  Camera,
  Image as ImageIcon,
  UploadCloud,
  Filter,
  ListFilter,
  ArrowUpDown,
  Star,
  Sparkles,
  ShoppingBag,
  User,
  LogIn,
  LogOut,
  Settings,
  Loader2,
  Check,
  Home,
} from "lucide-react";

/* ----------------------------- custom tier icons ---------------------------- */

const STAR_D =
  "M12 2l2.8 6.2L21 9.3l-4.8 4.4L17.4 21 12 17.8 6.6 21l1.2-7.3L3 9.3l6.2-1.1L12 2z";

const TierGoldIcon = React.forwardRef<SVGSVGElement, LucideProps>(
  function TierGoldIcon(
    { color = "currentColor", strokeWidth = 2, ...rest },
    ref,
  ) {
    const rid = React.useId();
    const gid = `qs-gold-${rid}`;
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
        {...rest}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--text)" stopOpacity="0.22" />
            <stop offset="55%" stopColor="var(--text)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--text)" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* smooth overlay */}
        <path d={STAR_D} fill={`url(#${gid})`} opacity="1" stroke="none" />
        {/* crisp outline */}
        <path d={STAR_D} fill="none" />
      </svg>
    );
  },
);

const TierDiamondIcon = React.forwardRef<SVGSVGElement, LucideProps>(
  function TierDiamondIcon(
    { color = "currentColor", strokeWidth = 2, ...rest },
    ref,
  ) {
    const rid = React.useId();
    const gid = `qs-diamond-${rid}`;
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
        {...rest}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--text)" stopOpacity="0.20" />
            <stop offset="55%" stopColor="var(--text)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--text)" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* smooth overlay */}
        <path
          d="M12 2 19 9 12 22 5 9 12 2Z"
          fill={`url(#${gid})`}
          opacity="1"
          stroke="none"
        />
        {/* outline */}
        <path d="M12 2 19 9 12 22 5 9 12 2Z" fill="none" />
        {/* facets */}
        <path d="M5 9h14" />
        <path d="M12 2l3.5 7" />
        <path d="M12 2 8.5 9" />
      </svg>
    );
  },
);

/* Registry */
export const icons = {
  search: Search,
  add: Plus,
  edit: Edit,
  delete: Trash2,
  heart: Heart,
  share: Share2,
  phone: Phone,
  message: MessageCircle,
  pin: MapPin,
  verified: CheckCircle2,
  error: XCircle,
  info: Info,
  secure: ShieldCheck,
  warning: AlertTriangle,
  camera: Camera,
  image: ImageIcon,
  upload: UploadCloud,
  filter: Filter,
  refine: ListFilter,
  sort: ArrowUpDown,
  star: Star,
  sparkles: Sparkles,
  bag: ShoppingBag,
  user: User,
  login: LogIn,
  logout: LogOut,
  settings: Settings,
  spinner: Loader2,
  check: Check,
  home: Home,

  // Featured tiers
  tierBasic: Star,
  tierGold: TierGoldIcon,
  tierDiamond: TierDiamondIcon,
} as const;

export type IconName = keyof typeof icons;
export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizePx: Record<IconSize, number> = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
};

export function getIcon(name: IconName | string, fallback: IconName = "info") {
  return (
    (icons as Record<string, React.ComponentType<LucideProps>>)[name] ??
    icons[fallback]
  );
}

export type IconProps = Omit<LucideProps, "size"> & {
  name: IconName;
  size?: IconSize | number;
  label?: string;
  title?: string;
  className?: string;
  strokeWidth?: number;
};

export const Icon = React.memo(
  React.forwardRef<SVGSVGElement, IconProps>(function Icon(
    { name, size = "md", label, title, className, strokeWidth = 2, ...rest },
    ref,
  ) {
    const Comp = getIcon(name);
    const pixel = typeof size === "number" ? size : sizePx[size];
    const ariaProps = label
      ? ({ role: "img", "aria-label": label } as const)
      : ({ "aria-hidden": true } as const);

    return (
      <Comp
        ref={ref}
        className={className}
        height={pixel}
        width={pixel}
        strokeWidth={strokeWidth}
        focusable="false"
        data-icon={name}
        {...ariaProps}
        {...rest}
      >
        {(title || label) && <title>{title || label}</title>}
      </Comp>
    );
  }),
);

/* Spinner */
export const Spinner = React.memo(function Spinner({
  size = "sm",
  className,
  label = "Loading",
  ...rest
}: Omit<IconProps, "name"> & { label?: string }) {
  return (
    <Icon
      name="spinner"
      size={size}
      className={["animate-spin-slow", className].filter(Boolean).join(" ")}
      label={label}
      {...rest}
    />
  );
});

export default Icon;
