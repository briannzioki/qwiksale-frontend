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

type RequestMetrics = {
  active: number;
  expired: number;
  boosted: number;
  today: number;
};

function makeApiUrl(path: string) {
  const envBase =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["APP_URL"] ||
    process.env["VERCEL_URL"];

  let base = envBase || "http://localhost:3000";
  if (!base.startsWith("http")) base = `https://${base}`;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function fetchRequestMetrics(): Promise<RequestMetrics | null> {
  try {
    const r = await fetch(makeApiUrl("/api/admin/requests/metrics"), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;

    const j: any = await r.json().catch(() => null);
    if (!j || typeof j !== "object") return null;

    const m = (j.metrics && typeof j.metrics === "object" ? j.metrics : j) as any;

    const active = Number(m.active);
    const expired = Number(m.expired);
    const boosted = Number(m.boosted);
    const today = Number(m.today);

    return {
      active: Number.isFinite(active) ? active : 0,
      expired: Number.isFinite(expired) ? expired : 0,
      boosted: Number.isFinite(boosted) ? boosted : 0,
      today: Number.isFinite(today) ? today : 0,
    };
  } catch {
    return null;
  }
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
    </div>
  );
}

export default async function AdminHome() {
  // Root admin entrypoint – keep strict SSR guard here.
  await requireAdmin();

  const metrics = await fetchRequestMetrics();

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
            <Link href="/admin/dashboard" prefetch={false} className="btn-gradient-primary text-sm">
              Metrics
            </Link>
            <Link href="/" prefetch={false} className="btn-outline text-sm">
              Home
            </Link>
          </div>
        }
      />

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Requests</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Active" value={metrics ? String(metrics.active) : "—"} />
          <MetricCard label="Expired" value={metrics ? String(metrics.expired) : "—"} />
          <MetricCard label="Boosted" value={metrics ? String(metrics.boosted) : "—"} />
          <MetricCard label="Today" value={metrics ? String(metrics.today) : "—"} />
        </div>
        <div className="text-sm">
          <Link href="/admin/requests" prefetch={false} className="underline">
            Manage requests
          </Link>
        </div>
      </div>

      {/* ✅ Required by failing admin tests:
          - getByRole('region', { name: /messages snapshot/i }) OR
          - getByRole('link', { name: /open inbox/i })
      */}
      <section
        role="region"
        aria-label="Messages snapshot"
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Messages</h2>
          <span className="text-xs text-muted-foreground">Inbox</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Review buyer/seller conversations and follow up from listings.
        </p>
        <div className="mt-4">
          <Link href="/messages" prefetch={false} className="btn-outline text-sm">
            Open inbox
          </Link>
        </div>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li>
          <Link
            href="/admin/users"
            prefetch={false}
            className="block rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow"
          >
            <div className="font-semibold">Users</div>
            <div className="text-sm text-muted-foreground">Manage roles &amp; accounts</div>
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
