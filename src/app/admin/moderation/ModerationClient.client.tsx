// src/app/admin/moderation/ModerationClient.client.tsx
"use client";

import Link from "next/link";
import { useEffect, useTransition } from "react";

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

      <div className="overflow-x-auto rounded-xl border bg-white dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left dark:bg-slate-800">
            <tr>
              <th className="w-8 px-3 py-2">
                <input type="checkbox" data-check="all" aria-label="Select all reports" />
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
              <tr key={r.id} className="align-top border-t dark:border-slate-800">
                <td className="px-3 py-2">
                  <input type="checkbox" name="select" value={r.id} aria-label={`Select report ${r.id}`} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">{fmtDateTimeKE(r.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{r.listingId}</code>
                    <Link
                      className="text-[#39a0ca] hover:underline"
                      href={r.listingType === "product" ? `/product/${r.listingId}` : `/service/${r.listingId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${r.listingType} ${r.listingId}`}
                    >
                      open
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2">{r.listingType}</td>
                <td className="px-3 py-2">{r.reason}</td>
                <td className="max-w-[360px] px-3 py-2">
                  <div className="line-clamp-3 text-gray-700 dark:text-slate-200">
                    {r.details || <span className="opacity-60">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2">{r.userId || <span className="opacity-60">guest</span>}</td>
                <td className="px-3 py-2">{r.ip || <span className="opacity-60">—</span>}</td>
                <td className="px-3 py-2">{r.resolved ? "Yes" : "No"}</td>
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

      <div className="flex items-center justify-center gap-2">
        <span className="text-xs text-gray-600 dark:text-slate-300">
          Page {page} of {totalPages} • {total} reports
        </span>
      </div>
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

  const patchStatus = (status: "ACTIVE" | "HIDDEN") => {
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
        location.reload();
      } catch {
        alert("Network error");
      }
    });
  };

  const toggleResolved = () => {
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
        location.reload();
      } catch {
        alert("Network error");
      }
    });
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => patchStatus("HIDDEN")}
        className="rounded bg-red-600/90 px-2 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Hide listing"
      >
        Hide
      </button>
      <button
        onClick={() => patchStatus("ACTIVE")}
        className="rounded bg-emerald-600/90 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Unhide listing"
      >
        Unhide
      </button>
      <button
        onClick={toggleResolved}
        className="rounded border px-2 py-1 text-xs disabled:opacity-60"
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
  items: Array<{ id: string; listingId: string; listingType: "product" | "service" }>;
}) {
  const [pending, start] = useTransition();

  useEffect(() => {
    const master = document.querySelector<HTMLInputElement>('input[data-check="all"]');
    const boxes = () =>
      Array.from(document.querySelectorAll<HTMLInputElement>('input[name="select"]'));

    const onMasterChange = () => {
      const bs = boxes();
      bs.forEach((b) => (b.checked = !!master?.checked));
      if (master) master.indeterminate = false;
    };

    const onDocChange = () => {
      const bs = boxes();
      const checked = bs.filter((b) => b.checked).length;
      if (master) {
        master.checked = bs.length > 0 && checked === bs.length;
        master.indeterminate = checked > 0 && checked < bs.length;
      }
    };

    master?.addEventListener("change", onMasterChange);
    document.addEventListener("change", onDocChange);
    onDocChange();

    return () => {
      master?.removeEventListener("change", onMasterChange);
      document.removeEventListener("change", onDocChange);
    };
  }, []);

  const getSelected = () =>
    Array.from(document.querySelectorAll<HTMLInputElement>('input[name="select"]:checked')).map(
      (i) => i.value,
    );

  const doResolve = (flag: "1" | "0") =>
    start(async () => {
      const ids = getSelected();
      if (!ids.length) return alert("Select at least one report.");
      const form = new FormData();
      ids.forEach((id) => form.append("ids", id));
      form.set("resolved", flag);
      await fetch("/admin/moderation/actions/resolve", {
        method: "POST",
        body: form,
        cache: "no-store",
        credentials: "same-origin",
      });
      location.reload();
    });

  const doVisibility = (status: "ACTIVE" | "HIDDEN") =>
    start(async () => {
      const ids = getSelected();
      if (!ids.length) return alert("Select at least one report.");
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
      location.reload();
    });

  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        onClick={() => doResolve("1")}
        className="rounded bg-emerald-600/90 px-3 py-1 text-sm text-white hover:bg-emerald-600 disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Mark selected as resolved"
      >
        Resolve selected
      </button>
      <button
        onClick={() => doResolve("0")}
        className="rounded border px-3 py-1 text-sm disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Mark selected as unresolved"
      >
        Unresolve selected
      </button>
      <span className="mx-2 opacity-50">•</span>
      <button
        onClick={() => doVisibility("HIDDEN")}
        className="rounded bg-red-600/90 px-3 py-1 text-sm text-white hover:bg-red-600 disabled:opacity-60"
        disabled={pending}
        aria-busy={pending}
        title="Hide selected listings"
      >
        Hide listings
      </button>
      <button
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
