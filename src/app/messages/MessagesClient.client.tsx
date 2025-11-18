"use client";
// src/app/messages/MessagesClient.client.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

/* ----------------------------- Types (unchanged) ----------------------------- */
type Thread = {
  id: string;
  listingId: string;
  listingType: "product" | "service";
  buyerId: string;
  sellerId: string;
  lastMessageAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  buyerLastReadAt: string | Date | null;
  sellerLastReadAt: string | Date | null;
  buyer: { id: string; name: string | null; username: string | null; image: string | null };
  seller: { id: string; name: string | null; username: string | null; image: string | null };
  _count: { messages: number };
};

type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string | Date;
  readAt: string | Date | null;
};

type Props = { meId?: string };

/* -------------------------------- Helpers -------------------------------- */
function fmtTime(ts: string | Date) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
function dayKey(ts: string | Date) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function initials(name?: string | null, username?: string | null) {
  const label = (name || username || "User").trim();
  const parts = label.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase() || "U";
}
function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/* -------------------------------- Component -------------------------------- */
export default function MessagesClient({ meId }: Props) {
  const sp = useSearchParams();

  // ------------ Threads state ------------
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsErr, setThreadsErr] = useState<string | null>(null);

  // use ?t=<threadId> deep-link if present
  const [selected, setSelected] = useState<string | null>(sp.get("t") || null);

  // ------------ Messages state ------------
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [msgsErr, setMsgsErr] = useState<string | null>(null);

  // Compose
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const abortThreadsRef = useRef<AbortController | null>(null);
  const abortMsgsRef = useRef<AbortController | null>(null);
  const lastCountRef = useRef(0);

  const fetchJSON = useCallback(async (url: string, ac?: AbortController | null) => {
    try {
      const init: RequestInit = {
        cache: "no-store",
        credentials: "same-origin",
        ...(ac ? { signal: ac.signal } : {}),
      };
      const r = await fetch(url, init);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error || `HTTP ${r.status}`);
      return j;
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
      throw e;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 160;
    el.scrollTo({ top: el.scrollHeight, behavior: nearBottom ? "smooth" : "auto" });
  }, []);

  /* ------------------------------ Load threads ------------------------------ */
  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsErr(null);
    abortThreadsRef.current?.abort();
    const ac = new AbortController();
    abortThreadsRef.current = ac;
    try {
      const j = await fetchJSON("/api/messages", ac);
      if (!j) return;
      const items: Thread[] = Array.isArray((j as any)?.items) ? (j as any).items : [];
      items.sort(
        (a, b) =>
          (new Date(b.updatedAt || b.lastMessageAt).getTime() || 0) -
          (new Date(a.updatedAt || a.lastMessageAt).getTime() || 0)
      );
      setThreads(items);

      if (!selected && items.length) {
        // Select first thread in UI only — no URL/nav mutation on mount
        setSelected(items[0]!.id);
      } else if (selected && !items.some((t) => t.id === selected) && items.length) {
        setSelected(items[0]!.id);
      }
    } catch (e: any) {
      setThreadsErr(e?.message || "Failed to load threads");
    } finally {
      setThreadsLoading(false);
    }
  }, [fetchJSON, selected]);

  // initial load + gentle polling for thread list
  useEffect(() => {
    loadThreads();
    const t = window.setInterval(loadThreads, 20_000);
    return () => {
      window.clearInterval(t);
      abortThreadsRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selection in sync with URL (deep-link)
  useEffect(() => {
    const t = sp.get("t");
    if (t && t !== selected) setSelected(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  /* ------------------------------ Load messages ----------------------------- */
  const loadThread = useCallback(
    async (id: string, { silent = false }: { silent?: boolean } = {}) => {
      if (!id) return;
      if (!silent) {
        setMsgsLoading(true);
        setMsgsErr(null);
      }
      abortMsgsRef.current?.abort();
      const ac = new AbortController();
      abortMsgsRef.current = ac;
      try {
        const j = await fetchJSON(`/api/messages/${encodeURIComponent(id)}`, ac);
        if (!j) return;
        const arr: Message[] = Array.isArray((j as any)?.messages) ? (j as any).messages : [];
        arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(arr);
        // mark as read (best-effort)
        fetch(`/api/messages/${encodeURIComponent(id)}/read`, {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
        }).catch(() => {});
        setTimeout(scrollToBottom, 0);
      } catch (e: any) {
        if (!silent) setMsgsErr(e?.message || "Failed to load conversation");
      } finally {
        if (!silent) setMsgsLoading(false);
      }
    },
    [fetchJSON, scrollToBottom]
  );

  // load + poll active conversation
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    void loadThread(selected);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadThread(selected, { silent: true });
      }
    }, 8_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void loadThread(selected, { silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      abortMsgsRef.current?.abort();
    };
  }, [selected, loadThread]);

  // smooth scroll on new messages
  useEffect(() => {
    if (messages.length > lastCountRef.current) scrollToBottom();
    lastCountRef.current = messages.length;
  }, [messages, scrollToBottom]);

  /* --------------------------------- Derived -------------------------------- */
  const current = useMemo(
    () => (selected ? threads.find((t) => t.id === selected) || null : null),
    [threads, selected]
  );

  const counterpart = useMemo(() => {
    if (!current) return null;
    const other = meId && current.buyerId === meId ? current.seller : current.buyer;
    const label = other.username || other.name || "User";
    return { label, image: other.image, initials: initials(other.name, other.username) };
  }, [current, meId]);

  /* --------------------------------- Send ---------------------------------- */
  const send = async () => {
    const trimmed = body.trim();
    if (!selected || !trimmed || sending) return;

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      senderId: meId || "me",
      body: trimmed,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    setMessages((ms) => [...ms, optimistic]);
    setBody("");
    scrollToBottom();

    setSending(true);
    try {
      const r = await fetch(`/api/messages/${encodeURIComponent(selected)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({ body: trimmed }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as any));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      await Promise.all([loadThread(selected, { silent: true }), loadThreads()]);
    } catch (e: any) {
      setMessages((ms) => ms.filter((m) => m.id !== optimistic.id));
      setBody(trimmed);
      toast.error(e?.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  /* --------------------------------- Render --------------------------------- */
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      {/* Thread list */}
      <aside className="md:col-span-4">
        <div className="card p-0 overflow-hidden">
          <div className="border-b px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Conversations</h2>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {threadsLoading ? "…" : threads.length}
              </span>
            </div>
          </div>

          <div className="max-h-[70dvh] overflow-y-auto divide-y dark:divide-slate-800">
            {threadsLoading && (
              <div className="p-4 text-sm text-gray-500 dark:text-slate-400">Loading…</div>
            )}

            {threadsErr && !threadsLoading && (
              <div className="p-4 text-sm text-rose-600 dark:text-rose-400">{threadsErr}</div>
            )}

            {!threadsLoading && !threadsErr && threads.length === 0 && (
              <div className="p-4 text-sm text-gray-600 dark:text-slate-400">
                No conversations yet. Message a seller or buyer to start a thread.
              </div>
            )}

            {threads.map((t) => {
              const isSel = selected === t.id;
              const other = meId && t.buyerId === meId ? t.seller : t.buyer;
              const label = other.name || other.username || "User";
              const sub = `${t.listingType === "product" ? "Product" : "Service"} • #${t.listingId.slice(0, 6)}…`;
              const when = fmtTime(t.updatedAt || t.lastMessageAt);

              return (
                <Link
                  key={t.id}
                  href={`/messages?t=${encodeURIComponent(t.id)}`}
                  prefetch={false}
                  className={cn(
                    "block w-full px-4 py-3 text-left transition",
                    isSel ? "bg-brandBlue/5 dark:bg-white/5" : "hover:bg-black/5 dark:hover:bg-white/5"
                  )}
                >
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-700 dark:bg-slate-800 dark:text-slate-200">
                      {initials(other.name, other.username)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate font-medium">{label}</div>
                        <div className="shrink-0 text-[11px] text-gray-500 dark:text-slate-400">{when}</div>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <div className="truncate text-xs text-gray-600 dark:text-slate-400">{sub}</div>
                        <span className="shrink-0 text-[10px] text-gray-400 dark:text-slate-500">
                          {t._count?.messages ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Chat panel */}
      <section className="md:col-span-8">
        <div className="card p-0 overflow-hidden flex min-h-[60vh] flex-col">
          {/* Header */}
          <div className="border-b px-4 py-3 dark:border-slate-800">
            {current ? (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-700 dark:bg-slate-800 dark:text-slate-200">
                  {counterpart?.initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{counterpart?.label || "Conversation"}</div>
                  <div className="truncate text-xs text-gray-500 dark:text-slate-400">
                    {current.listingType === "product" ? "Product" : "Service"} • #{current.listingId}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600 dark:text-slate-300">Select a conversation</div>
            )}
          </div>

          {/* Messages list */}
          <div ref={listRef} aria-live="polite" className="flex-1 overflow-auto px-3 py-3 space-y-2">
            {msgsLoading && messages.length === 0 && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-md bg-gray-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            )}

            {msgsErr && !msgsLoading && messages.length === 0 && (
              <div className="text-sm text-rose-600 dark:text-rose-400 px-1">{msgsErr}</div>
            )}

            {/* Day separators + bubbles */}
            {messages.length > 0 &&
              (() => {
                const items: ReactNode[] = [];
                let prevDay = "";
                messages.forEach((m) => {
                  const k = dayKey(m.createdAt);
                  if (k !== prevDay) {
                    prevDay = k;
                    items.push(
                      <div key={`day-${k}`} className="my-2 flex items-center justify-center">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] text-gray-500 shadow-sm dark:bg-slate-800 dark:text-slate-400">
                          {new Date(m.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    );
                  }
                  const mine = meId && m.senderId === meId;
                  items.push(
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-2 shadow-sm",
                          mine
                            ? "bg-[#161748] text-white dark:bg-[#161748]"
                            : "bg-white text-gray-900 ring-1 ring-black/5 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10"
                        )}
                      >
                        <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                          {m.body}
                        </div>
                        <div
                          className={cn(
                            "mt-1 text-[10px]",
                            mine ? "text-white/80" : "text-gray-500 dark:text-slate-400"
                          )}
                        >
                          {fmtTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                });
                return items;
              })()}

            {!msgsLoading && !msgsErr && messages.length === 0 && current && (
              <div className="text-sm text-gray-600 dark:text-slate-300 px-1">No messages yet.</div>
            )}
          </div>

          {/* Composer */}
          <form
            className="border-t px-3 py-3 dark:border-slate-800"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                className="textarea flex-1 min-h-[44px] max-h-[40dvh] resize-y"
                placeholder="Write a message…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "enter") {
                    e.preventDefault();
                    void send();
                  }
                }}
                disabled={!current || sending}
                rows={1}
              />
              <button
                type="submit"
                disabled={!current || sending || !body.trim()}
                className={cn(
                  "btn-gradient-primary",
                  (!current || sending || !body.trim()) && "opacity-60 cursor-not-allowed"
                )}
                aria-label="Send message"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
