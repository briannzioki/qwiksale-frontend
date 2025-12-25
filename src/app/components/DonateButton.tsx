"use client";

import Link from "next/link";

export default function DonateButton() {
  return (
    <Link
      href="/donate"
      className={[
        "inline-flex items-center gap-2",
        // ✅ phone-first: tighter while keeping safe touch target
        "min-h-9 rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm",
        "bg-[var(--bg-elevated)] text-[var(--text)]",
        "border border-[var(--border-subtle)]",
        "shadow-sm transition",
        "hover:bg-[var(--bg-subtle)]",
        "active:scale-[.99]",
        "focus-visible:outline-none focus-visible:ring-2 ring-focus",
      ].join(" ")}
    >
      ❤️ Donate
    </Link>
  );
}
