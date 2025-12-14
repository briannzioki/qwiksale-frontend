"use client";

import React from "react";
import { Icon } from "@/app/components/Icon";

export default function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full",
        "px-2 py-0.5 text-xs font-medium",
        "bg-emerald-50 text-emerald-700 border border-emerald-200",
        "shadow-sm",
        className,
      ].join(" ")}
      title="Verified seller"
      data-testid="verified-badge"
    >
      <Icon name="check" className="h-3 w-3" aria-hidden />
      Verified
    </span>
  );
}
