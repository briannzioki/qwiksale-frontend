// src/app/admin/moderation/ModerationClient.client.tsx
"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ReportRow = {
  id: string;
  listingId: string;
  listingType: "product" | "service";
  reason: string;
  details: string | null;
  ip: string | null;
  userId: string | null;
  createdAt: string | Date;
  resolved: boolean;
};

const fmtDateTimeKE = (d: string | Date) => {
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    return new Intl.DateTimeFormat("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Nairobi",
    }).format(dt);
  } catch {
    return new Date(d as any).toLocaleString();
  }
};

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "rose" | "indigo";
}) {
  const map: Record<string, string> = {
    slate: "bg-muted text-muted-foreground",
    green:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    amber:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    rose:
      "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
    indigo:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}

export default function ModerationClient({
  items,
  page,
  totalPages,
  total,
}: {
  items: ReportRow[];
  page: number;
  totalPages: number;
  total: number;
}) {
  return (
    <>
      <BulkActions
        items={items.map((r) => ({
          id: r.id,
          listingId: r.listingId,
          listingType: r.listingType,
        }))}
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr className="align-middle">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  data-check="all"
                  aria-label="Select all reports"
                />
              </th>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Listing</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">Resolved</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr
                key={r.id}
                className="align-top border-t border-border hover:bg-muted"
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    name="select"
                    value={r.id}
                    aria-label={`Select report ${r.id}`}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {fmtDateTimeKE(r.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{r.listingId}</code>
                    <Link
                      className="text-[#39a0ca] hover:underline"
                      href={
                        r.listingType === "product"
                          ? `/product/${r.listingId}`
                          : `/service/${r.listingId}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${r.listingType} ${r.listingId}`}
                    >
                      open
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge
                    tone={r.listingType === "product" ? "indigo" : "green"}
                  >
                    {r.listingType}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge tone="amber">{r.reason}</Badge>
                </td>
                <td className="max-w-[420px] px-3 py-2">
                  {r.details ? (
                    <details className="group">
                      <summary className="cursor-pointer text-[#161748] underline decoration-dotted underline-offset-2 dark:text-[#39a0ca]">
                        View details
                      </summary>
                      <div className="mt-1 rounded-md border border-border px-2 py-1 text-[13px] text-foreground">
                        <pre className="whitespace-pre-wrap break-words">
                          {r.details}
                        </pre>
                      </div>
                    </details>
                  ) : (
                    <span className="opacity-60">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.userId || <span className="opacity-60">guest</span>}
                </td>
                <td className="px-3 py-2">
                  {r.ip || <span className="opacity-60">—</span>}
                </td>
                <td className="px-3 py-2">
                  {r.resolved ? (
                    <Badge tone="green">Yes</Badge>
                  ) : (
                    <Badge tone="rose">No</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <RowActions
                    listingId={r.listingId}
                    type={r.listingType}
                    resolved={r.resolved}
                    reportId={r.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Page {page} of {totalPages} • {total} reports
        </span>
        <span aria-live="polite" id="bulk-status" className="sr-only" />
      </nav>
    </>
  );
}

/* --------------------------- Row actions (client) --------------------------- */

function RowActions({
  listingId,
  type,
  resolved,
  reportId,
}: {
  listingId: string;
  type: "product" | "service";
  resolved: boolean;
  reportId: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const patchStatus = (status: "ACTIVE" | "HIDDEN") => {
    const msg =
      status === "HIDDEN"
        ? "Hide this listing? It will be invisible to the public."
        : "Unhide this listing?";
    if (!confirm(msg)) return;

    start(async () => {
      try {
        const url =
          type === "product"
            ? `/api/products/${encodeURIComponent(listingId)}`
            : `/api/services/${encodeURIComponent(listingId)}`;
        const r = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify({ status }),
        });
        if (!r.ok) {
          let msg = `${r.status}`;
          try {
            const j = (await r.json()) as any;
            msg = String(j?.error || msg);
          } catch {}
          alert(`Failed: ${msg}`);
          return;
        }
        router.refresh();
      } catch {
        alert("Network error");
      }
    });
  };

  const toggleResolved = () => {
    const msg = resolved
      ? "Mark this report as UNRESOLVED?"
      : "Mark this report as resolved?";
    if (!confirm(msg)) return;

    start(async () => {
      try {
        const form = new FormData();
        form.set("ids", reportId);
        form.set("resolved", resolved ? "0" : "1");
        await fetch("/admin/moderation/actions/resolve", {
          method: "POST",
          body: form,
          cache: "no-store",
          credentials: "same-origin",
        });
        router.refresh();
      } catch {
        alert("Network error");
      }
    });
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => patchStatus("HIDDEN")}
        className="rounded bg-red-600/90 px-2 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Hide listing"
      >
        Hide
      </button>
      <button
        type="button"
        onClick={() => patchStatus("ACTIVE")}
        className="rounded bg-emerald-600/90 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Unhide listing"
      >
        Unhide
      </button>
      <button
        type="button"
        onClick={toggleResolved}
        className="rounded border border-border px-2 py-1 text-xs disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title={resolved ? "Mark as unresolved" : "Mark as resolved"}
      >
        {resolved ? "Unresolve" : "Resolve"}
      </button>
    </div>
  );
}

/* ----------------------- Bulk actions (client) ----------------------- */

function BulkActions({
  items,
}: {
  items: Array<{
    id: string;
    listingId: string;
    listingType: "product" | "service";
  }>;
}) {
  const [pending, start] = useTransition();
  const [selectedCount, setSelectedCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const master =
      document.querySelector<HTMLInputElement>('input[data-check="all"]');
    const boxes = () =>
      Array.from(
        document.querySelectorAll<HTMLInputElement>('input[name="select"]'),
      );

    const updateCount = () => {
      const bs = boxes();
      const checked = bs.filter((b) => b.checked).length;
      setSelectedCount(checked);
      const status = document.getElementById("bulk-status");
      if (status) status.textContent = `${checked} selected`;
      if (master) {
        master.checked = bs.length > 0 && checked === bs.length;
        master.indeterminate = checked > 0 && checked < bs.length;
      }
    };

    const onMasterChange = () => {
      const bs = boxes();
      bs.forEach((b) => (b.checked = !!master?.checked));
      if (master) master.indeterminate = false;
      updateCount();
    };

    master?.addEventListener("change", onMasterChange);
    document.addEventListener("change", updateCount);
    updateCount();

    return () => {
      master?.removeEventListener("change", onMasterChange);
      document.removeEventListener("change", updateCount);
    };
  }, []);

  const getSelected = () =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[name="select"]:checked',
      ),
    ).map((i) => i.value);

  const doResolve = (flag: "1" | "0") =>
    start(async () => {
      const ids = getSelected();
      if (!ids.length) return alert("Select at least one report.");
      const question =
        flag === "1"
          ? "Mark selected reports as resolved?"
          : "Mark selected reports as UNRESOLVED?";
      if (!confirm(question)) return;

      const form = new FormData();
      ids.forEach((id) => form.append("ids", id));
      form.set("resolved", flag);
      await fetch("/admin/moderation/actions/resolve", {
        method: "POST",
        body: form,
        cache: "no-store",
        credentials: "same-origin",
      });
      router.refresh();
    });

  const doVisibility = (status: "ACTIVE" | "HIDDEN") =>
    start(async () => {
      const ids = getSelected();
      if (!ids.length) return alert("Select at least one report.");
      const actionText =
        status === "HIDDEN"
          ? "Hide all selected listings?"
          : "Unhide all selected listings?";
      if (!confirm(actionText)) return;

      const byReportId = new Map(items.map((r) => [r.id, r] as const));

      await Promise.all(
        ids.map(async (rid) => {
          const row = byReportId.get(rid);
          if (!row) return;
          const url =
            row.listingType === "product"
              ? `/api/products/${encodeURIComponent(row.listingId)}`
              : `/api/services/${encodeURIComponent(row.listingId)}`;
          await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            credentials: "same-origin",
            body: JSON.stringify({ status }),
          }).catch(() => {});
        }),
      );
      router.refresh();
    });

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="mr-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        Selected: <span className="font-semibold">{selectedCount}</span>
      </div>

      <button
        type="button"
        onClick={() => doResolve("1")}
        className="rounded bg-emerald-600/90 px-3 py-1 text-sm text-white hover:bg-emerald-600 disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Mark selected as resolved"
      >
        Resolve selected
      </button>
      <button
        type="button"
        onClick={() => doResolve("0")}
        className="rounded border border-border px-3 py-1 text-sm disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Mark selected as unresolved"
      >
        Unresolve selected
      </button>
      <span className="mx-2 opacity-40">•</span>
      <button
        type="button"
        onClick={() => doVisibility("HIDDEN")}
        className="rounded bg-red-600/90 px-3 py-1 text-sm text-white hover:bg-red-600 disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Hide selected listings"
      >
        Hide listings
      </button>
      <button
        type="button"
        onClick={() => doVisibility("ACTIVE")}
        className="rounded bg-[#161748] px-3 py-1 text-sm text-white hover:opacity-90 disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Unhide selected listings"
      >
        Unhide listings
      </button>
    </div>
  );
}
