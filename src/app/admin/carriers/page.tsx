// src/app/admin/carriers/page.tsx

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import SectionHeader from "@/app/components/SectionHeader";
import { prisma } from "@/app/lib/prisma";
import CarrierActions from "./CarrierActions.client";

export const metadata: Metadata = {
  title: "Carriers · QwikSale Admin",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

type CarrierStatus = "OFFLINE" | "AVAILABLE" | "ON_TRIP";
type PlanTier = "BASIC" | "GOLD" | "PLATINUM";
type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
type VehicleTypeEnum = "BICYCLE" | "MOTORBIKE" | "CAR" | "VAN" | "TRUCK";

type SearchParams = Record<string, string | string[] | undefined>;

type CarrierRow = {
  id: string;
  userId: string;

  phone: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;

  status: CarrierStatus;
  planTier: PlanTier;
  verificationStatus: VerificationStatus;

  lastSeenAt: string | null;

  suspendedUntil: string | null;
  bannedAt: string | null;
  bannedReason: string | null;

  user?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function asUpper(v: string | undefined) {
  return (v ?? "").trim().toUpperCase();
}

function isOneOf<T extends string>(v: string, allowed: readonly T[]): v is T {
  return (allowed as readonly string[]).includes(v);
}

function toIsoOrNull(v: any): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function fmtWhen(ts: string | null) {
  if (!ts) return "Never";
  const d = new Date(ts);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return "Never";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 10) return "Just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isSuspendedNow(suspendedUntil: string | null) {
  if (!suspendedUntil) return false;
  const ms = new Date(suspendedUntil).getTime();
  return Number.isFinite(ms) ? ms > Date.now() : false;
}

function isLive(lastSeenAt: string | null, cutoffSeconds = 90) {
  if (!lastSeenAt) return false;
  const ms = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= cutoffSeconds * 1000;
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel?: string | undefined;
}) {
  const safe = Number.isFinite(value) ? value : 0;
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text)]">
        {safe.toLocaleString("en-KE")}
      </div>
      {sublabel ? (
        <div className="mt-1 text-xs text-[var(--text-muted)]">{sublabel}</div>
      ) : null}
    </div>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={[
        "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={[
        "whitespace-nowrap px-3 py-2 align-middle text-sm text-[var(--text)]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

const STATUS_OPTIONS: readonly CarrierStatus[] = ["OFFLINE", "AVAILABLE", "ON_TRIP"] as const;
const TIER_OPTIONS: readonly PlanTier[] = ["BASIC", "GOLD", "PLATINUM"] as const;
const VERIFY_OPTIONS: readonly VerificationStatus[] = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;
const VEHICLE_TYPES: readonly VehicleTypeEnum[] = ["BICYCLE", "MOTORBIKE", "CAR", "VAN", "TRUCK"] as const;

async function safeLoadCarriers(where: any, take: number) {
  const anyPrisma = prisma as any;
  const carrierModel = anyPrisma?.carrierProfile;

  if (!carrierModel || typeof carrierModel.findMany !== "function") {
    return { rows: [] as CarrierRow[], total: 0 };
  }

  const orderBy = [{ createdAt: "desc" }];

  const tryWithUser = async () => {
    const list = await carrierModel.findMany({
      where,
      take,
      orderBy,
      select: {
        id: true,
        userId: true,
        phone: true,

        status: true,
        planTier: true,
        verificationStatus: true,

        lastSeenAt: true,
        suspendedUntil: true,
        bannedAt: true,
        bannedReason: true,

        user: {
          select: { id: true, name: true, email: true },
        },

        // ✅ vehicle data is on CarrierVehicle (vehicles relation)
        vehicles: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { type: true, registration: true },
        },
      },
    });

    return Array.isArray(list) ? list : [];
  };

  const tryWithoutUser = async () => {
    const list = await carrierModel.findMany({
      where,
      take,
      orderBy,
      select: {
        id: true,
        userId: true,
        phone: true,

        status: true,
        planTier: true,
        verificationStatus: true,

        lastSeenAt: true,
        suspendedUntil: true,
        bannedAt: true,
        bannedReason: true,

        vehicles: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { type: true, registration: true },
        },
      },
    });

    return Array.isArray(list) ? list : [];
  };

  const mapRow = (r: any): CarrierRow => {
    const status = String(r?.status ?? "OFFLINE").toUpperCase();
    const planTier = String(r?.planTier ?? "BASIC").toUpperCase();
    const verificationStatus = String(r?.verificationStatus ?? "UNVERIFIED").toUpperCase();

    const v0 = Array.isArray(r?.vehicles) ? r.vehicles[0] : null;

    const vehicleType =
      typeof v0?.type === "string" ? v0.type : v0?.type != null ? String(v0.type) : null;

    const vehiclePlate =
      typeof v0?.registration === "string"
        ? v0.registration
        : v0?.registration != null
          ? String(v0.registration)
          : null;

    return {
      id: String(r?.id ?? ""),
      userId: String(r?.userId ?? ""),

      phone: typeof r?.phone === "string" ? r.phone : r?.phone ? String(r.phone) : null,

      vehicleType,
      vehiclePlate,

      status: isOneOf(status, STATUS_OPTIONS) ? status : "OFFLINE",
      planTier: isOneOf(planTier, TIER_OPTIONS) ? planTier : "BASIC",
      verificationStatus: isOneOf(verificationStatus, VERIFY_OPTIONS) ? verificationStatus : "UNVERIFIED",

      lastSeenAt: toIsoOrNull(r?.lastSeenAt),
      suspendedUntil: toIsoOrNull(r?.suspendedUntil),
      bannedAt: toIsoOrNull(r?.bannedAt),
      bannedReason:
        typeof r?.bannedReason === "string" ? r.bannedReason : r?.bannedReason ? String(r.bannedReason) : null,

      user:
        r?.user && typeof r.user === "object"
          ? {
              id: String(r.user?.id ?? r?.userId ?? ""),
              name: typeof r.user?.name === "string" ? r.user.name : r.user?.name ? String(r.user.name) : null,
              email: typeof r.user?.email === "string" ? r.user.email : r.user?.email ? String(r.user.email) : null,
            }
          : null,
    };
  };

  let raw: any[] = [];
  try {
    raw = await tryWithUser();
  } catch {
    try {
      raw = await tryWithoutUser();
    } catch {
      raw = [];
    }
  }

  let total = 0;
  try {
    total = await carrierModel.count({ where });
    if (!Number.isFinite(total)) total = raw.length;
  } catch {
    total = raw.length;
  }

  const rows = raw.map(mapRow).filter((r) => r.id && r.userId);
  return { rows, total };
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // 🔐 Admin access enforced by /admin/layout via requireAdmin().

  const sp = await searchParams;

  const q = (first(sp["q"]) ?? "").trim().slice(0, 120);

  const statusRaw = asUpper(first(sp["status"]));
  const tierRaw = asUpper(first(sp["tier"]));
  const verificationRaw = asUpper(first(sp["verification"]));

  const status = isOneOf(statusRaw, STATUS_OPTIONS) ? statusRaw : undefined;
  const tier = isOneOf(tierRaw, TIER_OPTIONS) ? tierRaw : undefined;
  const verification = isOneOf(verificationRaw, VERIFY_OPTIONS) ? verificationRaw : undefined;

  const where: any = {};

  if (status) where.status = status;
  if (tier) where.planTier = tier;
  if (verification) where.verificationStatus = verification;

  if (q) {
    const qUpper = asUpper(q);

    where.OR = [
      { phone: { contains: q, mode: "insensitive" } },
      { userId: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { user: { name: { contains: q, mode: "insensitive" } } },

      // ✅ plate lives on CarrierVehicle.registration
      { vehicles: { some: { registration: { contains: q, mode: "insensitive" } } } },
    ];

    // ✅ allow searching by vehicle type keyword
    if (isOneOf(qUpper, VEHICLE_TYPES)) {
      where.OR.push({ vehicles: { some: { type: qUpper } } });
    }
  }

  const take = 200;
  const { rows, total } = await safeLoadCarriers(where, take);

  const bannedCount = rows.filter((r) => Boolean(r.bannedAt)).length;
  const suspendedCount = rows.filter((r) => isSuspendedNow(r.suspendedUntil)).length;
  const onlineCount = rows.filter((r) => r.status === "AVAILABLE").length;
  const liveCount = rows.filter((r) => isLive(r.lastSeenAt, 90)).length;

  const card =
    "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft";

  const actionBtnClass =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const selectCls =
    "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const inputCls =
    "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm transition placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const SectionHeaderAny = SectionHeader as any;

  return (
    <div className="space-y-6 text-[var(--text)]" aria-label="Admin carriers">
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Carriers</h1>

      <SectionHeaderAny
        title="Admin · Carriers"
        subtitle="Manage carrier enforcement, tier, and verification. Use filters to narrow the table."
        actions={
          <div className="flex gap-2">
            <Link href="/admin" prefetch={false} className={actionBtnClass}>
              Admin dashboard
            </Link>
            <Link href="/admin/users" prefetch={false} className={actionBtnClass}>
              Users
            </Link>
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Carriers (filtered)" value={total} sublabel={total > take ? `Showing first ${take}` : undefined} />
        <StatCard label="Online" value={onlineCount} sublabel="status = AVAILABLE" />
        <StatCard label="Live" value={liveCount} sublabel="lastSeenAt within 90s" />
        <StatCard label="Enforcement" value={bannedCount + suspendedCount} sublabel={`${bannedCount} banned • ${suspendedCount} suspended`} />
      </section>

      <section className={card} aria-label="Carrier filters">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Phone, plate, userId, email, name…"
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="status" className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Status
            </label>
            <select id="status" name="status" defaultValue={status ?? ""} className={selectCls}>
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tier" className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Tier
            </label>
            <select id="tier" name="tier" defaultValue={tier ?? ""} className={selectCls}>
              <option value="">All</option>
              {TIER_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="verification"
              className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
            >
              Verification
            </label>
            <select id="verification" name="verification" defaultValue={verification ?? ""} className={selectCls}>
              <option value="">All</option>
              {VERIFY_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" className="btn-gradient-primary">
              Apply filters
            </button>
            <Link href="/admin/carriers" prefetch={false} className={actionBtnClass}>
              Reset
            </Link>
            <span className="text-xs text-[var(--text-muted)]">Tip: Filters use the URL. Bookmarkable and test-friendly.</span>
          </div>
        </form>
      </section>

      <section className={card} aria-label="Carriers table">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Carrier list</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Actions are applied via admin carrier endpoints. If endpoints are not enabled yet, actions will show an error instead of breaking the page.
            </p>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            Showing{" "}
            <span className="font-semibold text-[var(--text)]">{rows.length.toLocaleString("en-KE")}</span>{" "}
            of{" "}
            <span className="font-semibold text-[var(--text)]">{total.toLocaleString("en-KE")}</span>
          </div>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="min-w-[1120px] text-sm">
            <thead className="bg-[var(--bg-subtle)]">
              <tr>
                <Th>Carrier</Th>
                <Th>User</Th>
                <Th>Vehicle</Th>
                <Th>Status</Th>
                <Th>Tier</Th>
                <Th>Verification</Th>
                <Th>Freshness</Th>
                <Th>Enforcement</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border-subtle)]">
              {rows.length ? (
                rows.map((r) => {
                  const suspendedNow = isSuspendedNow(r.suspendedUntil);
                  const bannedNow = Boolean(r.bannedAt);
                  const liveNow = isLive(r.lastSeenAt, 90);

                  return (
                    <tr key={r.id} className="transition hover:bg-[var(--bg-subtle)]">
                      <Td>
                        <div className="min-w-0">
                          <div className="truncate font-extrabold text-[var(--text)]">{r.id}</div>
                          <div className="mt-1 truncate text-xs text-[var(--text-muted)]">userId: {r.userId}</div>
                        </div>
                      </Td>

                      <Td>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[var(--text)]">{r.user?.name || "Unknown"}</div>
                          <div className="mt-1 truncate text-xs text-[var(--text-muted)]">{r.user?.email || "No email"}</div>
                        </div>
                      </Td>

                      <Td>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[var(--text)]">
                            {(r.vehicleType || "Unknown").toUpperCase()}
                          </div>
                          <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                            {r.vehiclePlate || r.phone || "No plate/phone"}
                          </div>
                        </div>
                      </Td>

                      <Td>
                        <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                          {r.status === "AVAILABLE" ? "AVAILABLE" : r.status === "ON_TRIP" ? "ON_TRIP" : "OFFLINE"}
                        </span>
                      </Td>

                      <Td>
                        <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                          {r.planTier}
                        </span>
                      </Td>

                      <Td>
                        <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                          {r.verificationStatus}
                        </span>
                      </Td>

                      <Td>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text)]">{liveNow ? "Live" : "Stale"}</div>
                          <div className="mt-1 text-xs text-[var(--text-muted)]">{fmtWhen(r.lastSeenAt)}</div>
                        </div>
                      </Td>

                      <Td>
                        <div className="flex flex-col gap-1">
                          {bannedNow ? (
                            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                              Banned
                            </span>
                          ) : null}
                          {suspendedNow ? (
                            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                              Suspended
                            </span>
                          ) : null}
                          {!bannedNow && !suspendedNow ? (
                            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs font-semibold text-[var(--text-muted)]">
                              OK
                            </span>
                          ) : null}
                        </div>
                      </Td>

                      <Td className="text-right">
                        <CarrierActions
                          carrierId={r.id}
                          current={{
                            status: r.status,
                            planTier: r.planTier,
                            verificationStatus: r.verificationStatus,
                            suspendedUntil: r.suspendedUntil,
                            bannedAt: r.bannedAt,
                            bannedReason: r.bannedReason,
                          }}
                        />
                      </Td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                    No carriers found. Adjust filters and try again.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-[var(--text-muted)]">
          Actions update enforcement fields (ban/suspend), tier, and verification. Carrier self-service is handled under the carrier routes.
        </div>
      </section>
    </div>
  );
}
