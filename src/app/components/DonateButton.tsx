// src/app/components/DonateButton.tsx
"use client";

import Link from "next/link";

export default function DonateButton() {
  return (
    <Link
      href="/donate"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brandBlue text-white font-semibold hover:opacity-90 shadow-sm"
    >
      ❤️ Donate
    </Link>
  );
}
