// src/app/dashboard/_components/DashboardMessagesPreview.tsx
import Link from "next/link";
import type { SellerInboxSummary } from "@/app/lib/dashboard";
import { fmtInt } from "@/app/lib/dashboard";

type Props = {
  inbox: SellerInboxSummary;
};

function initialsFromName(name?: string | null, username?: string | null) {
  const label = (name || username || "User").trim();
  if (!label) return "U";
  const parts = label.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  const out = (a + b).toUpperCase();
  return out || "U";
}

/**
 * DashboardMessagesPreview
 *
 * - Left: counters (unread, new in last 7 days, total)
 * - Right: a thin list of recent conversations
 *
 * Usage:
 *   <DashboardMessagesPreview inbox={inboxSummary} />
 */
export default function DashboardMessagesPreview({ inbox }: Props) {
  const total = inbox?.totalThreads ?? 0;
  const recentThreads = inbox?.recentThreads ?? [];

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
      {/* Summary card */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text)]">Messages</h2>
          <span className="text-[11px] text-[var(--text-muted)] sm:text-xs">
            Inbox overview
          </span>
        </div>

        <dl className="mt-3 space-y-2 text-xs sm:mt-4 sm:text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Unread conversations</dt>
            <dd className="font-semibold text-[var(--text)]">
              {fmtInt(inbox?.unreadThreads ?? 0)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">New messages (7 days)</dt>
            <dd className="font-semibold text-[var(--text)]">
              {fmtInt(inbox?.newMessagesLast7Days ?? 0)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Total conversations</dt>
            <dd className="font-semibold text-[var(--text)]">
              {fmtInt(total)}
            </dd>
          </div>
        </dl>

        <div className="mt-3 sm:mt-4">
          <Link
            href="/messages"
            prefetch={false}
            className="btn-outline text-xs sm:text-sm"
          >
            Open inbox
          </Link>
        </div>
      </div>

      {/* Recent conversations list */}
      <div className="lg:col-span-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4 md:p-5">
        <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            Recent conversations
          </h3>
          {total > 0 && (
            <p className="text-[11px] text-[var(--text-muted)] sm:text-xs">
              Showing up to {recentThreads.length} most recent
            </p>
          )}
        </div>

        {recentThreads.length === 0 ? (
          <p className="text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
            You don&apos;t have any conversations yet. Start chatting with buyers
            and sellers from a listing page.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {recentThreads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/messages?t=${encodeURIComponent(t.id)}`}
                  prefetch={false}
                  className="flex items-center gap-3 py-2 transition hover:bg-[var(--bg-subtle)] sm:py-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text)]">
                    {initialsFromName(t.counterpartName, t.counterpartUsername)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-xs font-medium text-[var(--text)] sm:text-sm">
                        {t.counterpartName}
                        {t.counterpartUsername &&
                          t.counterpartUsername !== t.counterpartName && (
                            <span className="ml-1 text-[11px] text-[var(--text-muted)] sm:text-xs">
                              @{t.counterpartUsername}
                            </span>
                          )}
                      </div>
                      <span className="shrink-0 text-[10px] text-[var(--text-muted)] sm:text-[11px]">
                        {new Date(t.lastMessageAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] sm:text-xs">
                      <span className="truncate">
                        {t.listingType === "product" ? "Product" : "Service"} • #
                        {t.listingId.slice(0, 6)}
                        &hellip;
                      </span>
                      <span className="shrink-0 text-[10px]">
                        {fmtInt(t.messagesCount)} msg
                        {t.messagesCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  {t.unread && (
                    <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-[var(--text)] opacity-80" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
