// src/app/admin/users/RoleActions.client.tsx
"use client";

import * as React from "react";

// Tiny client-safe shim so we don't depend on @sentry/* packages.
// If Sentry is mounted globally, we'll call into it; otherwise no-ops.
const sentry = {
  setTag(key: string, value: unknown) {
    try {
      (window as any)?.Sentry?.setTag?.(key, value);
    } catch {}
  },
  addBreadcrumb(b: any) {
    try {
      (window as any)?.Sentry?.addBreadcrumb?.(b);
    } catch {}
  },
  captureException(err: unknown, opts?: any) {
    try {
      (window as any)?.Sentry?.captureException?.(err, opts);
    } catch {}
  },
};

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
  const [optimisticRole, setOptimisticRole] =
    React.useState<Role>(currentRole);
  const [toast, setToast] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function setRole(next: Role) {
    if (next === optimisticRole) return;

    // Guard: SUPERADMIN can't demote self via UI
    if (isSelf && optimisticRole === "SUPERADMIN" && next !== "SUPERADMIN") {
      setToast({
        type: "error",
        message: "You cannot demote yourself from SUPERADMIN.",
      });
      return;
    }

    // Optional Sentry breadcrumbs (only if Sentry is present)
    sentry.setTag("area", "admin");
    sentry.addBreadcrumb({
      category: "admin.action",
      level: "info",
      message: "role.change.request",
      data: { targetUserId: userId, from: optimisticRole, to: next },
    });

    const prev = optimisticRole;
    setOptimisticRole(next);
    setPending(true);

    try {
      const r = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}/role`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify({ role: next }),
        },
      );

      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try {
          const j = (await r.json()) as any;
          if (j?.error) msg = String(j.error);
        } catch {}

        setOptimisticRole(prev);

        sentry.addBreadcrumb({
          category: "admin.action",
          level: "error",
          message: "role.change.failure",
          data: {
            targetUserId: userId,
            from: prev,
            to: next,
            status: r.status,
          },
        });

        setToast({
          type: "error",
          message: `Failed to update role: ${msg}`,
        });
        return;
      }

      sentry.addBreadcrumb({
        category: "admin.action",
        level: "info",
        message: "role.change.success",
        data: { targetUserId: userId, from: prev, to: next },
      });

      setToast({
        type: "success",
        message: `Role updated → ${next}`,
      });
    } catch (err) {
      setOptimisticRole(prev);
      sentry.captureException(err, { tags: { area: "admin" } });
      setToast({
        type: "error",
        message: "Network error updating role.",
      });
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
      "inline-flex items-center rounded-xl border px-2.5 py-1.5 text-xs transition " +
      "focus-visible:outline-none focus-visible:ring-2 ring-focus " +
      "active:scale-[.99] disabled:opacity-60";

    // Keep the prop for API stability; styling is now token-based (no palette colors).
    const palette: Record<typeof tone, string> = {
      slate:
        "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
      green:
        "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
      amber:
        "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
      indigo:
        "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
    };

    const activeCls =
      "font-semibold border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)] shadow-sm";

    return (
      <button
        type="button"
        title={title}
        aria-pressed={active}
        aria-label={active ? `${role} (current)` : `Set role to ${role}`}
        className={`${base} ${palette[tone]} ${active ? activeCls : ""}`}
        onClick={() => setRole(role)}
        disabled={pending || active}
      >
        {role}
      </button>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" aria-busy={pending}>
        <Btn role="USER" tone="slate" title="Set role to USER" />
        <Btn role="MODERATOR" tone="amber" title="Set role to MODERATOR" />
        <Btn role="ADMIN" tone="green" title="Set role to ADMIN" />
        <Btn role="SUPERADMIN" tone="indigo" title="Set role to SUPERADMIN" />
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-[2000] max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] shadow-soft ${
            toast.type === "success" ? "" : ""
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
