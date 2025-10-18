"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";

type Role = "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";

export default function RoleActions({
  userId,
  currentRole,
  isSelf,
}: {
  userId: string;
  currentRole: Role;
  isSelf: boolean;
}) {
  const [pending, setPending] = React.useState(false);
  const [optimisticRole, setOptimisticRole] = React.useState<Role>(currentRole);
  const [toast, setToast] = React.useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // auto-dismiss toast
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function setRole(next: Role) {
    if (next === optimisticRole) return;

    // UX guard: don't let a SUPERADMIN demote themselves in the UI
    if (isSelf && optimisticRole === "SUPERADMIN" && next !== "SUPERADMIN") {
      setToast({ type: "error", message: "You cannot demote yourself from SUPERADMIN." });
      return;
    }

    // ---- Sentry breadcrumb/tags (client) ----
    Sentry.setTag("area", "admin");
    Sentry.addBreadcrumb({
      category: "admin.action",
      level: "info",
      message: "role.change.request",
      data: { targetUserId: userId, from: optimisticRole, to: next },
    });

    const prev = optimisticRole;
    setOptimisticRole(next); // optimistic
    setPending(true);

    try {
      const r = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ role: next }),
      });

      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try {
          const j = (await r.json()) as any;
          if (j?.error) msg = String(j.error);
        } catch {}
        // rollback
        setOptimisticRole(prev);

        Sentry.addBreadcrumb({
          category: "admin.action",
          level: "error",
          message: "role.change.failure",
          data: { targetUserId: userId, from: prev, to: next, status: r.status },
        });
        setToast({ type: "error", message: `Failed to update role: ${msg}` });
        return;
      }

      Sentry.addBreadcrumb({
        category: "admin.action",
        level: "info",
        message: "role.change.success",
        data: { targetUserId: userId, from: prev, to: next },
      });
      setToast({ type: "success", message: `Role updated → ${next}` });
    } catch (err) {
      // rollback
      setOptimisticRole(prev);
      Sentry.captureException(err, { tags: { area: "admin" } });
      setToast({ type: "error", message: "Network error updating role." });
    } finally {
      setPending(false);
    }
  }

  const Btn = ({
    role,
    tone,
    title,
  }: {
    role: Role;
    tone: "slate" | "green" | "amber" | "indigo";
    title: string;
  }) => {
    const active = optimisticRole === role;
    const base =
      "inline-flex items-center rounded border px-2 py-1 text-xs transition disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
    const palette: Record<typeof tone, string> = {
      slate:
        "border-slate-300 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600",
      green:
        "border-green-300 text-green-800 hover:bg-green-50 dark:border-green-800 dark:text-green-200 dark:hover:bg-green-950/40 focus-visible:ring-green-400 dark:focus-visible:ring-green-700",
      amber:
        "border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40 focus-visible:ring-amber-400 dark:focus-visible:ring-amber-700",
      indigo:
        "border-indigo-300 text-indigo-800 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950/40 focus-visible:ring-indigo-400 dark:focus-visible:ring-indigo-700",
    };

    return (
      <button
        type="button"
        title={title}
        aria-pressed={active}
        aria-label={active ? `${role} (current)` : `Set role to ${role}`}
        className={`${base} ${palette[tone]} ${active ? "font-semibold ring-1 ring-current" : ""}`}
        onClick={() => setRole(role)}
        disabled={pending || active}
      >
        {role}
      </button>
    );
  };

  return (
    <>
      {/* action buttons */}
      <div className="flex flex-wrap items-center gap-1.5" aria-busy={pending}>
        <Btn role="USER" tone="slate" title="Set role to USER" />
        <Btn role="MODERATOR" tone="amber" title="Set role to MODERATOR" />
        <Btn role="ADMIN" tone="green" title="Set role to ADMIN" />
        <Btn role="SUPERADMIN" tone="indigo" title="Set role to SUPERADMIN" />
      </div>

      {/* simple, accessible toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-[2000] max-w-sm rounded-lg px-3 py-2 text-sm shadow-lg ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
