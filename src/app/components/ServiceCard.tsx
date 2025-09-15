// src/app/components/ServiceCard.tsx
"use client";

import Link from "next/link";
import SmartImage from "@/app/components/SmartImage";

type Props = {
  id: string;
  name: string;
  image?: string | null;
  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;
  serviceArea?: string | null;
  availability?: string | null;
  featured?: boolean;
  prefetch?: boolean;
  className?: string;
};

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for quote";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function rateSuffix(rt?: Props["rateType"]) {
  if (rt === "hour") return "/hr";
  if (rt === "day") return "/day";
  return "";
}

export default function ServiceCard({
  id,
  name,
  image,
  price,
  rateType,
  serviceArea,
  availability,
  featured = false,
  prefetch = true,
  className = "",
}: Props) {
  const src = image || "/placeholder/default.jpg";

  return (
    <Link
      href={`/service/${encodeURIComponent(id)}`}
      prefetch={prefetch}
      className={[
        "group overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        "dark:border-slate-800 dark:bg-slate-900",
        className,
      ].join(" ")}
      aria-label={name}
    >
      {/* Image (square thumb via SmartImage / Cloudinary) */}
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <SmartImage
          src={src}
          alt={name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          priority={false}
          placeholder="empty"
        />

        {featured && (
          <span className="absolute left-2 top-2 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-white shadow">
            Featured
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="line-clamp-1 font-semibold">{name}</div>
        <div className="mt-0.5 text-sm text-gray-600 dark:text-slate-300">
          {serviceArea || "Available"}
          {availability ? ` • ${availability}` : ""}
        </div>
        <div className="mt-1 text-[15px] font-bold text-[#161748] dark:text-white">
          {fmtKES(price)} {rateSuffix(rateType)}
        </div>
      </div>
    </Link>
  );
}
