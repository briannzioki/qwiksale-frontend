// src/app/admin/requests/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import SectionHeader from "@/app/components/SectionHeader";
import { requireAdmin } from "@/app/lib/authz";

type RequestDetail = {
  id: string;
  kind: "product" | "service";
  title: string;
  description?: string | null;
  location?: string | null;
  category?: string | null;
  tags?: string[] | null;
  status: string;
  createdAt: string | null;
  expiresAt: string | null;
  boostUntil: string | null;
  contactEnabled?: boolean | null;
  contactMode?: string | null;
  ownerId: string;
  owner?: {
    id: string;
    name?: string | null;
    username?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    verified?: boolean | null;
    requestBanUntil?: string | null;
    requestBanReason?: string | null;
    subscription?: string | null;
    createdAt?: string | null;
  } | null;
};

function makeApiUrl(path: string) {
  const envBase =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["VERCEL_URL"];

  let base = envBase || "http://localhost:3000";
  if (!base.startsWith("http")) base = `https://${base}`;
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "—";
  return t.toLocaleString("en-KE");
}

function isBoosted(boostUntilIso: string | null) {
  if (!boostUntilIso) return false;
  const t = new Date(boostUntilIso).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function isExpired(expiresAtIso: string | null) {
  if (!expiresAtIso) return false;
  const t = new Date(expiresAtIso).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const rid = String(id || "").trim();
  if (!rid) notFound();

  const url = `${makeApiUrl("/api/admin/requests")}?${new URLSearchParams({ id: rid }).toString()}`;

  let req: RequestDetail | null = null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as any;
      req = (json?.request as RequestDetail) || null;
    }
  } catch {
    // ignore
  }

  if (!req) notFound();

  const ownerId = String(req.ownerId || "");

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Request"
        subtitle="Admin detail view."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/requests" prefetch={false} className="btn-outline text-sm">
              Back to list
            </Link>
            <Link href={`/requests/${encodeURIComponent(req.id)}`} prefetch={false} className="btn-outline text-sm">
              Public page
            </Link>
            {ownerId && (
              <Link href={`/admin/users/${encodeURIComponent(ownerId)}`} prefetch={false} className="btn-outline text-sm">
                View owner
              </Link>
            )}
          </div>
        }
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{req.kind}</div>
            <h1 className="mt-1 text-xl font-bold text-foreground">{req.title}</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {req.location || "—"} {req.category ? <span>• {req.category}</span> : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs">
              {req.status}
            </span>
            {isExpired(req.expiresAt) && (
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                Expired
              </span>
            )}
            {isBoosted(req.boostUntil) && (
              <span className="inline-flex items-center rounded-full bg-[#161748] px-2 py-0.5 text-xs font-semibold text-white">
                Boosted
              </span>
            )}
          </div>
        </div>

        {req.description ? (
          <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground">
            {req.description}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            No description provided.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Created" value={fmtWhen(req.createdAt)} />
          <Meta label="Expires" value={fmtWhen(req.expiresAt)} />
          <Meta label="Boost until" value={fmtWhen(req.boostUntil)} />
          <Meta label="Contact" value={`${req.contactEnabled ? "Enabled" : "Disabled"} • ${req.contactMode || "—"}`} />
        </div>

        {Array.isArray(req.tags) && req.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {req.tags.slice(0, 20).map((t) => (
              <span key={t} className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="text-sm font-semibold text-foreground">Owner</div>
          <div className="text-sm text-muted-foreground">
            <div>
              <span className="font-semibold text-foreground">ID:</span> {ownerId || "—"}
            </div>
            <div>
              <span className="font-semibold text-foreground">Name:</span> {req.owner?.name || "—"}
            </div>
            <div>
              <span className="font-semibold text-foreground">Username:</span> {req.owner?.username || "—"}
            </div>
            <div>
              <span className="font-semibold text-foreground">Email:</span> {req.owner?.email || "—"}
            </div>
            <div>
              <span className="font-semibold text-foreground">Phone:</span> {req.owner?.phone || "—"}
            </div>
            <div>
              <span className="font-semibold text-foreground">WhatsApp:</span> {req.owner?.whatsapp || "—"}
            </div>
            <div>
              <span className="font-semibold text-foreground">Plan:</span> {req.owner?.subscription || "—"}
            </div>
            <div>
              <span className="font-semibold text-foreground">Joined:</span> {fmtWhen(req.owner?.createdAt || null)}
            </div>
          </div>

          {ownerId && (
            <div className="pt-2 border-t border-border space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Request posting ban
              </div>

              <form
                action={`/api/admin/users/${encodeURIComponent(ownerId)}/request-ban`}
                method="POST"
                className="grid grid-cols-1 gap-2 sm:grid-cols-6"
              >
                <input type="hidden" name="action" value="ban" />
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-muted-foreground">Ban until (ISO)</label>
                  <input
                    name="until"
                    placeholder="2026-01-01T00:00:00.000Z"
                    className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-muted-foreground">Reason (optional)</label>
                  <input
                    name="reason"
                    placeholder="Spam / abuse..."
                    className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  />
                </div>
                <div className="sm:col-span-6 flex flex-wrap gap-2">
                  <button type="submit" className="btn-outline text-sm">
                    Ban
                  </button>
                </div>
              </form>

              <form action={`/api/admin/users/${encodeURIComponent(ownerId)}/request-ban`} method="POST">
                <input type="hidden" name="action" value="unban" />
                <button type="submit" className="btn-outline text-sm">
                  Unban
                </button>
              </form>

              <div className="text-xs text-muted-foreground">
                Current ban: {req.owner?.requestBanUntil ? fmtWhen(req.owner.requestBanUntil) : "None"}
                {req.owner?.requestBanReason ? <span> • {req.owner.requestBanReason}</span> : null}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="text-sm font-semibold text-foreground">Actions</div>

          <form action="/api/admin/requests" method="POST" className="space-y-2">
            <input type="hidden" name="action" value="close" />
            <input type="hidden" name="id" value={req.id} />
            <button type="submit" className="btn-outline text-sm">
              Close request
            </button>
            <div className="text-xs text-muted-foreground">
              Admin close sets status to <span className="font-semibold">CLOSED</span>.
            </div>
          </form>

          <form
            action={`/api/admin/requests/${encodeURIComponent(req.id)}/delete`}
            method="POST"
            className="space-y-2"
          >
            <button type="submit" className="btn-outline text-sm">
              Delete request
            </button>
            <div className="text-xs text-muted-foreground">
              Delete is <span className="font-semibold">hard-delete</span>.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
