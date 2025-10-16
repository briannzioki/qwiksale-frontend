// src/app/components/Icon.tsx
"use client";

import * as React from "react";
import type { LucideProps } from "lucide-react";
import {
  Search, Plus, Edit, Trash2, Heart, Share2, Phone, MessageCircle, MapPin,
  CheckCircle2, XCircle, Info, ShieldCheck, AlertTriangle, Camera,
  Image as ImageIcon, UploadCloud, Filter, ListFilter, ArrowUpDown, Star,
  Sparkles, ShoppingBag, User, LogIn, LogOut, Settings, Loader2, Check, Home,
} from "lucide-react";

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
} as const;

export type IconName = keyof typeof icons;
export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizePx: Record<IconSize, number> = { xs: 14, sm: 16, md: 18, lg: 20, xl: 24 };

export function getIcon(name: IconName | string, fallback: IconName = "info") {
  return (icons as Record<string, React.ComponentType<LucideProps>>)[name] ?? icons[fallback];
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
    ref
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
  })
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
