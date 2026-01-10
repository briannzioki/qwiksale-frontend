export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/app/lib/prisma";
import { carrierEnforcementFromRow, requireUser } from "@/app/lib/authz";

type ReqRow = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  pickupNear: string | null;
  productId: string | null;
};

function toIso(v: any) {
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
}

function asString(v: any): string {
  return v == null ? "" : String(v);
}

async function fetchCarrierRequests(anyPrisma: any, carrierId: string): Promise<ReqRow[]> {
  const reqModel = anyPrisma?.deliveryRequest;
  if (!reqModel || typeof reqModel.findMany !== "function") return [];

  const tryPickupNear = async () => {
    const list = await reqModel.findMany({
      where: { carrierId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        pickupNear: true,
        productId: true,
      },
    });

    return (Array.isArray(list) ? list : []).map((r) => ({
      id: asString(r?.id),
      type: asString(r?.type || "DELIVERY"),
      status: asString(r?.status || "PENDING"),
      createdAt: toIso(r?.createdAt),
      pickupNear: r?.pickupNear ? asString(r.pickupNear) : null,
      productId: r?.productId ? asString(r.productId) : null,
    })) as ReqRow[];
  };

  const tryPickupLabel = async () => {
    const list = await reqModel.findMany({
      where: { carrierId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        pickupLabel: true,
        productId: true,
      },
    });

    return (Array.isArray(list) ? list : []).map((r) => ({
      id: asString(r?.id),
      type: asString(r?.type || "DELIVERY"),
      status: asString(r?.status || "PENDING"),
      createdAt: toIso(r?.createdAt),
      pickupNear: r?.pickupLabel ? asString(r.pickupLabel) : null,
      productId: r?.productId ? asString(r.productId) : null,
    })) as ReqRow[];
  };

  try {
    return await tryPickupNear();
  } catch {
    try {
      return await tryPickupLabel();
    } catch {
      return [];
    }
  }
}

function fmtIsoForUi(iso: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const ms = d.getTime();
    if (!Number.isFinite(ms)) return iso;
    return d.toISOString().slice(0, 19).replace("T", " ");
  } catch {
    return iso;
  }
}

export default async function CarrierRequestsPage() {
  const authed = await requireUser({ callbackUrl: "/carrier/requests" });
  const userId = authed.id;

  const anyPrisma = prisma as any;
  const carrierModel = anyPrisma?.carrierProfile;

  const carrier =
    carrierModel && typeof carrierModel.findUnique === "function"
      ? await carrierModel
          .findUnique({
            where: { userId },
            select: { id: true, bannedAt: true, bannedReason: true, suspendedUntil: true },
          })
          .catch(() => null)
      : carrierModel && typeof carrierModel.findFirst === "function"
        ? await carrierModel
            .findFirst({
              where: { userId },
              select: { id: true, bannedAt: true, bannedReason: true, suspendedUntil: true },
            })
            .catch(() => null)
        : null;

  if (!carrier?.id) {
    redirect("/carrier/onboarding");
  }

  const enforcement = carrierEnforcementFromRow(carrier);
  const blocked = enforcement.isBanned || enforcement.isSuspended;

  const rows = blocked ? [] : await fetchCarrierRequests(anyPrisma, String(carrier.id));

  // IMPORTANT: do NOT wrap in AppShell here; RootLayout already renders the site header/footer.
  return (
    <main className="container-page py-4 text-[var(--text)] sm:py-6" aria-label="Carrier requests">
      <div className="space-y-6">
        <header className="hero-surface rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Carrier
          </p>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl">
            Requests
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            View incoming and assigned delivery requests. Some actions may be disabled if your
            carrier account is suspended or banned.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href="/carrier" prefetch={false} className="btn-outline">
              Back to carrier dashboard
            </Link>
            <Link href="/dashboard" prefetch={false} className="btn-outline">
              User dashboard
            </Link>
          </div>
        </header>

        {blocked ? (
          <section
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5"
            aria-label="Carrier enforcement"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Account restricted</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {enforcement.isBanned
                    ? "Your carrier account has been banned. You cannot accept or view requests."
                    : "Your carrier account is temporarily suspended. You cannot accept or view requests until the suspension ends."}
                </p>
              </div>

              <span className="badge">{enforcement.isBanned ? "BANNED" : "SUSPENDED"}</span>
            </div>

            <div className="mt-3 grid gap-2 text-sm">
              {enforcement.isBanned ? (
                <>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Banned at
                    </div>
                    <div className="mt-1 font-semibold text-[var(--text)]">
                      {fmtIsoForUi(enforcement.bannedAt) ?? "Unknown"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Reason
                    </div>
                    <div className="mt-1 text-[var(--text)]">
                      {enforcement.bannedReason ?? "Not provided"}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Suspended until
                  </div>
                  <div className="mt-1 font-semibold text-[var(--text)]">
                    {fmtIsoForUi(enforcement.suspendedUntil) ?? "Unknown"}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/carrier" prefetch={false} className="btn-outline">
                Go to carrier dashboard
              </Link>
              <Link href="/dashboard" prefetch={false} className="btn-outline">
                Go to user dashboard
              </Link>
            </div>
          </section>
        ) : (
          <section
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5"
            aria-label="Requests list"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Latest requests</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  This list appears once the DeliveryRequest model and carrier request APIs are enabled.
                </p>
              </div>

              <Link
                href="/carrier"
                prefetch={false}
                className={[
                  "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2",
                  "text-sm font-semibold text-[var(--text)] shadow-sm transition",
                  "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                ].join(" ")}
              >
                Manage status
              </Link>
            </div>

            <div className="mt-4 overflow-auto">
              <table className="min-w-[760px] text-sm">
                <thead className="bg-[var(--bg-subtle)]">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Request
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Type
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Pickup
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {rows.length ? (
                    rows.map((r) => (
                      <tr key={r.id} className="transition hover:bg-[var(--bg-subtle)]">
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-[var(--text)]">
                          {r.id}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[var(--text)]">{r.type}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[var(--text)]">{r.status}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[var(--text)]">
                          {r.pickupNear ? r.pickupNear : "Unknown"}
                          {r.productId ? (
                            <span className="ml-2 text-xs text-[var(--text-muted)]">
                              (product {r.productId})
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[var(--text-muted)]">
                          {r.createdAt.slice(0, 19).replace("T", " ")}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                        No requests yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs text-[var(--text-muted)]">
              When carrier APIs are enabled, this page will also support Accept and Complete actions.
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
