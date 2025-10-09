// src/app/messages/MessagesClient.client.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

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

type Props = {
  /** current user's id (from server component) */
  meId?: string;
};

export default function MessagesClient({ meId }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsErr, setThreadsErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(sp.get("t") || null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [msgsErr, setMsgsErr] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const abortThreadsRef = useRef<AbortController | null>(null);
  const abortMsgsRef = useRef<AbortController | null>(null);

  const fetchJSON = useCallback(async (url: string, ac?: AbortController | null) => {
    try {
      // Avoid passing null to RequestInit.signal under stricter lib dom typings
      const init: RequestInit = ac ? { cache: "no-store", signal: ac.signal } : { cache: "no-store" };
      const r = await fetch(url, init);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error || `HTTP ${r.status}`);
      return j;
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
      throw e;
    }
  }, []);

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
      setThreads(items);
      // Auto-select first thread if none selected yet (and no deep-link)
      if (!selected && items.length) {
        setSelected(items[0]!.id);
        router.replace(`/messages?t=${encodeURIComponent(items[0]!.id)}`, { scroll: false });
      }
    } catch (e: any) {
      setThreadsErr(e?.message || "Failed to load threads");
    } finally {
      setThreadsLoading(false);
    }
  }, [fetchJSON, router, selected]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

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
        setMessages(arr);
        setTimeout(scrollToBottom, 0);
      } catch (e: any) {
        setMsgsErr(e?.message || "Failed to load conversation");
      } finally {
        if (!silent) setMsgsLoading(false);
      }
    },
    [fetchJSON, scrollToBottom]
  );

  // initial load + refresh threads on mount
  useEffect(() => {
    loadThreads();
    return () => {
      // abort any in-flight threads request on unmount
      abortThreadsRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selection in sync with URL (deep-link)
  useEffect(() => {
    const t = sp.get("t");
    if (t && t !== selected) {
      setSelected(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  // Load messages for the selected thread, and poll while visible
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }

    let interval: number | undefined;

    const startPolling = () => {
      void loadThread(selected);
      interval = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void loadThread(selected, { silent: true });
        }
      }, 5000);
    };

    startPolling();

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void loadThread(selected, { silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (interval) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      abortMsgsRef.current?.abort();
    };
  }, [selected, loadThread]);

  const current = useMemo(
    () => (selected ? threads.find((t) => t.id === selected) || null : null),
    [threads, selected]
  );

  const otherParty = useMemo(() => {
    if (!current) return null;
    const other = meId && current.buyerId === meId ? current.seller : current.buyer;
    const label = other.username || other.name || "User";
    return label;
  }, [current, meId]);

  const handleSelect = (id: string) => {
    setSelected(id);
    // update URL (no scroll)
    router.replace(`/messages?t=${encodeURIComponent(id)}`, { scroll: false });
  };

  const send = async () => {
    const trimmed = body.trim();
    if (!selected || !trimmed || sending) return;

    // Optimistic append
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
        body: JSON.stringify({ body: trimmed }),
      });
      if (!r.ok) {
        throw new Error((await r.json().catch(() => ({} as any)))?.error || `HTTP ${r.status}`);
      }
      // Re-sync from server to get real id/read states
      await Promise.all([loadThread(selected, { silent: true }), loadThreads()]);
    } catch (e: any) {
      // Roll back optimistic if failed
      setMessages((ms) => ms.filter((m) => m.id !== optimistic.id));
      toast.error(e?.message || "Failed to send");
      setBody(trimmed); // restore text so user can retry
    } finally {
      setSending(false);
    }
  };

  // Scroll to bottom whenever message list grows
  const lastCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > lastCountRef.current) {
      scrollToBottom();
    }
    lastCountRef.current = messages.length;
  }, [messages, scrollToBottom]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
      {/* Thread list */}
      <aside className="md:col-span-4 rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-3">
        <div className="font-semibold mb-2">Your threads</div>

        {threadsLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-gray-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        )}

        {threadsErr && !threadsLoading && (
          <div className="text-sm text-rose-600 dark:text-rose-400">{threadsErr}</div>
        )}

        {!threadsLoading && !threadsErr && (
          <div className="divide-y dark:divide-slate-800">
            {threads.map((t) => {
              const isSel = selected === t.id;
              const counterpart =
                meId && t.buyerId === meId
                  ? t.seller.username || t.seller.name || "User"
                  : t.buyer.username || t.buyer.name || "User";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t.id)}
                  className={[
                    "w-full text-left py-2 px-2 rounded-lg transition",
                    isSel ? "bg-gray-50 dark:bg-slate-800" : "hover:bg-gray-50 dark:hover:bg-slate-800/60",
                  ].join(" ")}
                >
                  <div className="text-sm">
                    <div className="font-medium line-clamp-1">
                      {counterpart} • {t.listingType === "product" ? "Product" : "Service"} #{t.listingId.slice(0, 6)}…
                    </div>
                    <div className="text-xs text-gray-600 dark:text-slate-300">
                      {new Date(t.lastMessageAt).toLocaleString()} • {t._count.messages} msgs
                    </div>
                  </div>
                </button>
              );
            })}
            {threads.length === 0 && !threadsLoading && (
              <div className="text-sm text-gray-600 dark:text-slate-300 py-6 text-center">
                No threads yet.
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Thread view */}
      <section className="md:col-span-8 rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-3 flex flex-col min-h-[60vh]">
        {current ? (
          <>
            <div className="font-semibold mb-2">
              {current.listingType === "product" ? "Product" : "Service"} • {current.listingId}
              {otherParty ? <span className="opacity-70"> • with {otherParty}</span> : null}
            </div>

            <div
              ref={listRef}
              className="flex-1 overflow-auto space-y-2 p-2 border rounded-lg dark:border-slate-800"
            >
              {msgsLoading && messages.length === 0 && (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-10 rounded-md bg-gray-100 dark:bg-slate-800 animate-pulse" />
                  ))}
                </div>
              )}

              {msgsErr && !msgsLoading && messages.length === 0 && (
                <div className="text-sm text-rose-600 dark:text-rose-400">{msgsErr}</div>
              )}

              {messages.map((m) => {
                const mine = meId && m.senderId === meId;
                return (
                  <div key={m.id} className={`text-sm flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={[
                        "max-w-[80%] rounded-lg px-3 py-2",
                        mine
                          ? "bg-[#161748] text-white dark:bg-[#161748]"
                          : "bg-gray-100 dark:bg-slate-800 dark:text-slate-100",
                      ].join(" ")}
                    >
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className={`mt-1 text-[10px] opacity-70 ${mine ? "text-white" : ""}`}>
                        {new Date(m.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!msgsLoading && !msgsErr && messages.length === 0 && (
                <div className="text-sm text-gray-600 dark:text-slate-300">No messages yet.</div>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                placeholder="Write a message…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                disabled={!current || sending}
              />
              <button
                type="button"
                onClick={send}
                disabled={!current || sending || !body.trim()}
                className="rounded bg-[#161748] text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-sm text-gray-600 dark:text-slate-300">
            {threadsLoading ? "Loading threads…" : "Select a thread."}
          </div>
        )}
      </section>
    </div>
  );
}
