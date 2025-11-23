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
  // Root admin entrypoint – keep strict SSR guard here.
  await requireAdmin();

  return (
    <div className="space-y-6">
      {/* Heading asserted in tests */}
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <SectionHeader
        as="h2"
        title="Overview"
        subtitle="Quick links to key administration areas."
        actions={
          <div className="flex gap-2">
            <Link
              href="/admin/dashboard"
              prefetch={false}
              className="btn-gradient-primary text-sm"
            >
              Metrics
            </Link>
            <Link
              href="/"
              prefetch={false}
              className="btn-outline text-sm"
            >
              Home
            </Link>
          </div>
        }
      />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li>
          <Link
            href="/admin/users"
            prefetch={false}
            className="block rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow"
          >
            <div className="font-semibold">Users</div>
            <div className="text-sm text-muted-foreground">
              Manage roles &amp; accounts
            </div>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/listings"
            prefetch={false}
            className="block rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow"
          >
            <div className="font-semibold">Listings</div>
            <div className="text-sm text-muted-foreground">
              Products &amp; services across the marketplace
            </div>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/moderation"
            prefetch={false}
            className="block rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow"
          >
            <div className="font-semibold">Moderation</div>
            <div className="text-sm text-muted-foreground">
              Review reports &amp; hide problem listings
            </div>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/reveals"
            prefetch={false}
            className="block rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow"
          >
            <div className="font-semibold">Contact reveals</div>
            <div className="text-sm text-muted-foreground">
              Audit who revealed phone numbers
            </div>
          </Link>
        </li>
      </ul>
    </div>
  );
}
