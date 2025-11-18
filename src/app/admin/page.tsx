// src/app/admin/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import { requireAdmin } from "@/app/lib/authz";

export const metadata: Metadata = {
  title: "Admin · QwikSale",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function AdminHome() {
  await requireAdmin(); // strict SSR guard

  return (
    <div className="space-y-6">
      {/* Heading asserted in tests */}
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <SectionHeader
        as="h2"
        title="Overview"
        subtitle="Quick links to administration areas."
        actions={
          <div className="flex gap-2">
            <Link href="/" prefetch={false} className="btn-outline text-sm">
              Home
            </Link>
          </div>
        }
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Link
            href="/admin/users"
            prefetch={false}
            className="block rounded-xl border bg-white p-4 shadow-sm hover:shadow dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="font-semibold">Users</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">Manage roles &amp; accounts</div>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/listings"
            prefetch={false}
            className="block rounded-xl border bg-white p-4 shadow-sm hover:shadow dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="font-semibold">Listings</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">Products &amp; services</div>
          </Link>
        </li>
      </ul>
    </div>
  );
}
