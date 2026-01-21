export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/authz";

import CarrierDashboardClient from "./_components/CarrierDashboardClient.client";

type CarrierSerialized = {
  id: string;
  userId: string;

  phone: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
  vehiclePhotoKeys: string[];
  docPhotoKey: string | null;
  stationLat: number | null;
  stationLng: number | null;

  planTier: string;
  verificationStatus: string;
  status: string;

  lastSeenAt: string | null;
  lastLat: number | null;
  lastLng: number | null;

  suspendedUntil: string | null;
  bannedAt: string | null;
  bannedReason: string | null;

  createdAt: string | null;
  updatedAt: string | null;
};

type CarrierEnforcement = {
  banned: boolean;
  suspended: boolean;
  suspendedUntil: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
};

function toIsoOrNull(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toNumOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  return v == null ? null : String(v);
}

function parseStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .filter((x: any) => typeof x === "string" && x.trim())
      .map((x: string) => x.trim())
      .slice(0, 12);
  }
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x: any) => typeof x === "string" && x.trim())
          .map((x: string) => x.trim())
          .slice(0, 12);
      }
    } catch {
      // ignore
    }
  }
  return [];
}

function serializeCarrier(raw: any): CarrierSerialized {
  const lastSeenLat = raw?.lastSeenLat ?? raw?.lastLat;
  const lastSeenLng = raw?.lastSeenLng ?? raw?.lastLng;

  return {
    id: String(raw?.id ?? ""),
    userId: String(raw?.userId ?? ""),

    phone: asString(raw?.phone),
    vehicleType: asString(raw?.vehicleType),
    vehiclePlate: asString(raw?.vehiclePlate),
    vehiclePhotoKeys: parseStringArray(raw?.vehiclePhotoKeys),
    docPhotoKey: asString(raw?.docPhotoKey),
    stationLat: toNumOrNull(raw?.stationLat),
    stationLng: toNumOrNull(raw?.stationLng),

    planTier: String(raw?.planTier ?? "BASIC"),
    verificationStatus: String(raw?.verificationStatus ?? "UNVERIFIED"),
    status: String(raw?.status ?? "OFFLINE"),

    lastSeenAt: toIsoOrNull(raw?.lastSeenAt),
    lastLat: toNumOrNull(lastSeenLat),
    lastLng: toNumOrNull(lastSeenLng),

    suspendedUntil: toIsoOrNull(raw?.suspendedUntil),
    bannedAt: toIsoOrNull(raw?.bannedAt),
    bannedReason: asString(raw?.bannedReason),

    createdAt: toIsoOrNull(raw?.createdAt),
    updatedAt: toIsoOrNull(raw?.updatedAt),
  };
}

function computeEnforcement(carrier: CarrierSerialized): CarrierEnforcement {
  const now = Date.now();
  const banned = Boolean(carrier.bannedAt);

  const suspendedUntilMs = carrier.suspendedUntil
    ? new Date(carrier.suspendedUntil).getTime()
    : NaN;
  const suspended = Number.isFinite(suspendedUntilMs) ? suspendedUntilMs > now : false;

  return {
    banned,
    suspended,
    suspendedUntil: carrier.suspendedUntil,
    bannedAt: carrier.bannedAt,
    bannedReason: carrier.bannedReason,
  };
}

function fmtDateTimeKE(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  try {
    return d.toLocaleString("en-KE", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone?: "neutral" | "warn" | "danger";
}) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm";

  const cls =
    tone === "danger"
      ? "border-white/25 bg-white/15 text-white"
      : tone === "warn"
        ? "border-white/20 bg-white/12 text-white"
        : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]";

  return (
    <span className={[base, cls].join(" ")} aria-label={label}>
      {label}
    </span>
  );
}

function EnforcementScreen({ enforcement }: { enforcement: CarrierEnforcement }) {
  const isBanned = enforcement.banned;
  const isSuspended = enforcement.suspended;

  const title = isBanned ? "Carrier account banned" : "Carrier account suspended";

  const bannedAt = fmtDateTimeKE(enforcement.bannedAt);
  const suspendedUntil = fmtDateTimeKE(enforcement.suspendedUntil);

  return (
    <main
      className="container-page py-4 text-[var(--text)] sm:py-6"
      aria-label="Carrier enforcement"
    >
      <header className="hero-surface rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/75">
              Carrier
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              {title}
            </h1>
          </div>
          {isBanned ? (
            <StatusChip label="BANNED" tone="danger" />
          ) : (
            <StatusChip label="SUSPENDED" tone="warn" />
          )}
        </div>

        <p className="mt-2 text-sm text-white/90">
          {isBanned
            ? "Your carrier profile has been banned and carrier actions are disabled."
            : "Your carrier profile is temporarily suspended and carrier actions are disabled until your suspension ends."}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {isBanned ? (
            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--text-muted)]">
                Banned at
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--text)]">
                {bannedAt ?? "Unknown"}
              </div>
              <div className="mt-3 text-xs font-semibold text-[var(--text-muted)]">
                Reason
              </div>
              <div className="mt-1 text-sm text-[var(--text)]">
                {enforcement.bannedReason?.trim()
                  ? enforcement.bannedReason
                  : "No reason was provided."}
              </div>
            </div>
          ) : (
            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--text-muted)]">
                Suspended until
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--text)]">
                {suspendedUntil ?? "Unknown"}
              </div>
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                When the suspension expires, you can access the carrier dashboard again.
              </div>
            </div>
          )}

          <div className="card p-4">
            <div className="text-xs font-semibold text-[var(--text-muted)]">
              What you can do now
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text)]">
              <li>Go back to your main dashboard.</li>
              <li>Check the Help Center for support options.</li>
              <li>
                If you believe this is a mistake, contact support with your account
                email.
              </li>
            </ul>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard" prefetch={false} className="btn-outline">
                Back to dashboard
              </Link>
              <Link href="/help" prefetch={false} className="btn-gradient-primary">
                Help Center
              </Link>
            </div>
          </div>
        </div>
      </header>
    </main>
  );
}

function normalizeUsernameForLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/^@+/, "");
  if (!s) return null;
  return /^[a-z0-9._-]{2,64}$/i.test(s) ? s : null;
}

function displayNameForClient(u: any): string | null {
  const uname = normalizeUsernameForLabel(u?.username);
  if (uname) return `@${uname}`;
  if (typeof u?.name === "string" && u.name.trim()) return u.name.trim();
  if (typeof u?.email === "string" && u.email.trim()) return u.email.trim();
  return null;
}

export default async function CarrierPage() {
  const authed = await requireUser({ callbackUrl: "/carrier" });
  const userId = String((authed as any)?.id ?? "").trim();

  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/carrier")}`);
  }

  const anyPrisma = prisma as any;
  const carrierModel = anyPrisma?.carrierProfile;

  const carrierRaw =
    carrierModel && typeof carrierModel.findUnique === "function"
      ? await carrierModel.findUnique({ where: { userId } }).catch(() => null)
      : carrierModel && typeof carrierModel.findFirst === "function"
        ? await carrierModel.findFirst({ where: { userId } }).catch(() => null)
        : null;

  if (!carrierRaw) {
    redirect("/carrier/onboarding");
  }

  const carrier = serializeCarrier(carrierRaw);
  const enforcement = computeEnforcement(carrier);

  if (enforcement.banned || enforcement.suspended) {
    return <EnforcementScreen enforcement={enforcement} />;
  }

  return (
    <main
      className="container-page py-4 text-[var(--text)] sm:py-6"
      aria-label="Carrier dashboard"
    >
      <CarrierDashboardClient
        initialCarrier={carrier}
        enforcement={enforcement}
        user={{
          id: userId,
          name: displayNameForClient(authed) ?? null,
          email: (authed as any)?.email ?? null,
        }}
      />
    </main>
  );
}
