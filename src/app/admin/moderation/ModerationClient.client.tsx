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
          <thead className="text-left bg-gray-50 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 w-8">
                <input type="checkbox" data-check="all" />
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
              <tr key={r.id} className="border-t dark:border-slate-800 align-top">
                <td className="px-3 py-2">
                  <input type="checkbox" name="select" value={r.id} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{r.listingId}</code>
                    {r.listingType === "product" ? (
                      <Link
                        className="text-[#39a0ca]"
                        href={`/product/${r.listingId}`}
                        target="_blank"
                      >
                        open
                      </Link>
                    ) : (
                      <Link
                        className="text-[#39a0ca]"
                        href={`/service/${r.listingId}`}
                        target="_blank"
                      >
                        open
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">{r.listingType}</td>
                <td className="px-3 py-2">{r.reason}</td>
                <td className="px-3 py-2 max-w-[360px]">
                  <div className="line-clamp-3 text-gray-700 dark:text-slate-200">
                    {r.details || <span className="opacity-60">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {r.userId || <span className="opacity-60">guest</span>}
                </td>
                <td className="px-3 py-2">
                  {r.ip || <span className="opacity-60">—</span>}
                </td>
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

      <div className="flex justify-center items-center gap-2">
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
          body: JSON.stringify({ status }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          alert(`Failed: ${j?.error || r.status}`);
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
        className="rounded bg-red-600/90 text-white px-2 py-1 text-xs hover:bg-red-600 disabled:opacity-60"
        disabled={pending}
      >
        Hide
      </button>
      <button
        onClick={() => patchStatus("ACTIVE")}
        className="rounded bg-emerald-600/90 text-white px-2 py-1 text-xs hover:bg-emerald-600 disabled:opacity-60"
        disabled={pending}
      >
        Unhide
      </button>
      <button
        onClick={toggleResolved}
        className="rounded border px-2 py-1 text-xs disabled:opacity-60"
        disabled={pending}
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
    const sync = () => {
      const bs = boxes();
      if (master) master.checked = bs.length > 0 && bs.every((b) => b.checked);
    };
    master?.addEventListener("change", () => {
      const bs = boxes();
      bs.forEach((b) => (b.checked = !!master?.checked));
    });
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, []);

  const getSelected = () =>
    Array.from(document.querySelectorAll<HTMLInputElement>('input[name="select"]:checked')).map(
      (i) => i.value
    );

  const doResolve = (flag: "1" | "0") =>
    start(async () => {
      const ids = getSelected();
      if (!ids.length) return alert("Select at least one report.");
      const form = new FormData();
      ids.forEach((id) => form.append("ids", id));
      form.set("resolved", flag);
      await fetch("/admin/moderation/actions/resolve", { method: "POST", body: form });
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
            body: JSON.stringify({ status }),
          }).catch(() => {});
        })
      );
      location.reload();
    });

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => doResolve("1")}
        className="rounded bg-emerald-600/90 text-white px-3 py-1 text-sm hover:bg-emerald-600 disabled:opacity-60"
        disabled={pending}
      >
        Resolve selected
      </button>
      <button
        onClick={() => doResolve("0")}
        className="rounded border px-3 py-1 text-sm disabled:opacity-60"
        disabled={pending}
      >
        Unresolve selected
      </button>
      <span className="mx-2 opacity-50">•</span>
      <button
        onClick={() => doVisibility("HIDDEN")}
        className="rounded bg-red-600/90 text-white px-3 py-1 text-sm hover:bg-red-600 disabled:opacity-60"
        disabled={pending}
      >
        Hide listings
      </button>
      <button
        onClick={() => doVisibility("ACTIVE")}
        className="rounded bg-[#161748] text-white px-3 py-1 text-sm hover:opacity-90 disabled:opacity-60"
        disabled={pending}
      >
        Unhide listings
      </button>
    </div>
  );
}
