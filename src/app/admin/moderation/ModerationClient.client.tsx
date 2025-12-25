// src/app/admin/moderation/ModerationClient.client.tsx
"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, useCallback } from "react";
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
    // Token-only badge system (neutral, consistent across light/dark)
    slate:
      "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)]",
    green:
      "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)]",
    amber:
      "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)]",
    rose:
      "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)]",
    indigo:
      "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)]",
  };

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        map[tone],
      ].join(" ")}
    >
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
  const shellClass =
    "overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft";

  const headRowClass =
    "bg-[var(--bg)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";

  const cellBase = "px-3 py-2 text-sm text-[var(--text)]";
  const cellMuted = "px-3 py-2 text-sm text-[var(--text-muted)]";

  const checkboxClass =
    "h-4 w-4 rounded border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const linkClass =
    "text-[var(--text)] underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 ring-focus rounded";

  return (
    <>
      <BulkActions
        items={items.map((r) => ({
          id: r.id,
          listingId: r.listingId,
          listingType: r.listingType,
        }))}
      />

      <div className={shellClass}>
        <table className="min-w-full text-sm">
          <thead className={headRowClass}>
            <tr className="align-middle">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  data-check="all"
                  aria-label="Select all reports"
                  className={checkboxClass}
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

          <tbody className="divide-y divide-[var(--border-subtle)]">
            {items.map((r) => (
              <tr
                key={r.id}
                className="align-top hover:bg-[var(--bg-subtle)]"
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    name="select"
                    value={r.id}
                    aria-label={`Select report ${r.id}`}
                    className={checkboxClass}
                  />
                </td>

                <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--text-muted)]">
                  {fmtDateTimeKE(r.createdAt)}
                </td>

                <td className={cellBase}>
                  <div className="flex items-center gap-2">
                    <code className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-0.5 text-xs text-[var(--text)]">
                      {r.listingId}
                    </code>

                    <Link
                      className={linkClass}
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

                <td className={cellBase}>
                  <Badge tone={r.listingType === "product" ? "indigo" : "green"}>
                    {r.listingType}
                  </Badge>
                </td>

                <td className={cellBase}>
                  <Badge tone="amber">{r.reason}</Badge>
                </td>

                <td className="max-w-[420px] px-3 py-2 text-sm text-[var(--text)]">
                  {r.details ? (
                    <details className="group">
                      <summary className="cursor-pointer select-none text-[var(--text)] underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 ring-focus rounded">
                        View details
                      </summary>
                      <div className="mt-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text)] shadow-sm">
                        <pre className="whitespace-pre-wrap break-words">
                          {r.details}
                        </pre>
                      </div>
                    </details>
                  ) : (
                    <span className="text-[var(--text-muted)]">-</span>
                  )}
                </td>

                <td className={cellMuted}>
                  {r.userId || (
                    <span className="text-[var(--text-muted)]">guest</span>
                  )}
                </td>

                <td className={cellMuted}>
                  {r.ip || <span className="text-[var(--text-muted)]">-</span>}
                </td>

                <td className={cellBase}>
                  {r.resolved ? (
                    <Badge tone="green">Resolved</Badge>
                  ) : (
                    <Badge tone="rose">Pending</Badge>
                  )}
                </td>

                <td className={cellBase}>
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

      <nav className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
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

  const suspend = (nextSuspended: boolean) => {
    const label = nextSuspended ? "suspend" : "unsuspend";
    const msg = nextSuspended
      ? "Suspend this listing? It will be blocked from the marketplace."
      : "Unsuspend this listing and restore it.";
    if (!confirm(msg)) return;

    start(async () => {
      try {
        const res = await fetch("/api/admin/listings/suspend", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId,
            kind: type,
            suspended: nextSuspended,
          }),
        });
        if (!res.ok) {
          let msg = `${res.status}`;
          try {
            const j = (await res.json()) as any;
            msg = String(j?.error || msg);
          } catch {
            // ignore
          }
          alert(`Failed to ${label} listing: ${msg}`);
          return;
        }
        router.refresh();
      } catch {
        alert("Network error while updating listing.");
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
        const r = await fetch("/admin/moderation/actions/resolve", {
          method: "POST",
          body: form,
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!r.ok) {
          alert("Failed to update report resolution.");
          return;
        }
        router.refresh();
      } catch {
        alert("Network error while updating report.");
      }
    });
  };

  const btnBase =
    "inline-flex items-center justify-center rounded-xl border px-2 py-1 text-xs font-semibold transition active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-60";

  const btnNeutral =
    "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--bg-subtle)]";

  const btnElev =
    "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm hover:bg-[var(--bg-subtle)]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => suspend(true)}
        className={`${btnBase} ${btnElev}`}
        disabled={pending}
        aria-busy={pending}
        title="Suspend listing"
      >
        Suspend
      </button>

      <button
        type="button"
        onClick={() => suspend(false)}
        className={`${btnBase} ${btnElev}`}
        disabled={pending}
        aria-busy={pending}
        title="Unsuspend listing"
      >
        Unsuspend
      </button>

      <button
        type="button"
        onClick={toggleResolved}
        className={`${btnBase} ${btnNeutral}`}
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
    const master = document.querySelector<HTMLInputElement>(
      'input[data-check="all"]',
    );
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

  const getSelected = useCallback(
    () =>
      Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[name="select"]:checked',
        ),
      ).map((i) => i.value),
    [],
  );

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

  const doSuspend = (suspended: boolean) =>
    start(async () => {
      const ids = getSelected();
      if (!ids.length) return alert("Select at least one report.");
      const actionText = suspended
        ? "Suspend all selected listings?"
        : "Unsuspend all selected listings?";
      if (!confirm(actionText)) return;

      const byReportId = new Map(items.map((r) => [r.id, r] as const));

      const payloadItems = ids
        .map((rid) => byReportId.get(rid))
        .filter(Boolean)
        .map((row) => ({
          listingId: row!.listingId,
          kind: row!.listingType,
        }));

      if (!payloadItems.length) {
        router.refresh();
        return;
      }

      await fetch("/api/admin/listings/suspend", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: payloadItems,
          suspended,
        }),
      }).catch(() => {});

      router.refresh();
    });

  const pillClass =
    "inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-muted)]";

  const btnBase =
    "inline-flex items-center justify-center rounded-xl border px-3 py-1 text-sm font-semibold transition active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-60";

  const btnElev =
    "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm hover:bg-[var(--bg-subtle)]";

  const btnNeutral =
    "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--bg-subtle)]";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className={pillClass}>
        Selected:{" "}
        <span className="ml-1 font-semibold text-[var(--text)]">
          {selectedCount}
        </span>
      </div>

      <button
        type="button"
        onClick={() => doResolve("1")}
        className={`${btnBase} ${btnElev}`}
        disabled={pending}
        aria-busy={pending}
        title="Mark selected as resolved"
      >
        Resolve selected
      </button>

      <button
        type="button"
        onClick={() => doResolve("0")}
        className={`${btnBase} ${btnNeutral}`}
        disabled={pending}
        aria-busy={pending}
        title="Mark selected as unresolved"
      >
        Unresolve selected
      </button>

      <span
        className="mx-1 select-none text-[var(--text-muted)]"
        aria-hidden="true"
      >
        •
      </span>

      <button
        type="button"
        onClick={() => doSuspend(true)}
        className={`${btnBase} ${btnElev}`}
        disabled={pending}
        aria-busy={pending}
        title="Suspend selected listings"
      >
        Suspend listings
      </button>

      <button
        type="button"
        onClick={() => doSuspend(false)}
        className={`${btnBase} ${btnElev}`}
        disabled={pending}
        aria-busy={pending}
        title="Unsuspend selected listings"
      >
        Unsuspend listings
      </button>
    </div>
  );
}
