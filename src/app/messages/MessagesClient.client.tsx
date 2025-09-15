"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function MessagesClient() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");

  const loadThreads = async () => {
    const r = await fetch("/api/messages", { cache: "no-store" });
    const j = await r.json();
    if (r.ok) setThreads(j.items || []);
  };

  const loadThread = async (id: string) => {
    const r = await fetch(`/api/messages/${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await r.json();
    if (r.ok) setMessages(j.messages || []);
  };

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadThread(selected);
    const t = setInterval(() => loadThread(selected), 5000);
    return () => clearInterval(t);
  }, [selected]);

  const current = useMemo(() => threads.find((t) => t.id === selected) || null, [threads, selected]);

  const send = async () => {
    if (!selected || !body.trim()) return;
    const r = await fetch(`/api/messages/${encodeURIComponent(selected)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ body }),
    });
    if (r.ok) {
      setBody("");
      loadThread(selected);
      loadThreads();
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
      {/* Thread list */}
      <aside className="md:col-span-4 rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-3">
        <div className="font-semibold mb-2">Your threads</div>
        <div className="divide-y dark:divide-slate-800">
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`w-full text-left py-2 ${selected === t.id ? "bg-gray-50 dark:bg-slate-800" : ""}`}
            >
              <div className="text-sm">
                <div className="font-medium">
                  {t.listingType === "product" ? "Product" : "Service"} • {t.listingId.slice(0, 6)}…
                </div>
                <div className="text-xs text-gray-600 dark:text-slate-300">
                  {new Date(t.lastMessageAt).toLocaleString()} • {t._count.messages} msgs
                </div>
              </div>
            </button>
          ))}
          {threads.length === 0 && (
            <div className="text-sm text-gray-600 dark:text-slate-300 py-6 text-center">No threads yet.</div>
          )}
        </div>
      </aside>

      {/* Thread view */}
      <section className="md:col-span-8 rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-3 flex flex-col">
        {current ? (
          <>
            <div className="font-semibold mb-2">
              {current.listingType === "product" ? "Product" : "Service"} • {current.listingId}
            </div>
            <div className="flex-1 overflow-auto space-y-2 p-2 border rounded-lg dark:border-slate-800">
              {messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <div className="opacity-60 text-xs">{new Date(m.createdAt).toLocaleString()}</div>
                  <div>{m.body}</div>
                </div>
              ))}
              {messages.length === 0 && (
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
                    send();
                  }
                }}
              />
              <button
                onClick={send}
                className="rounded bg-[#161748] text-white px-4 py-2 text-sm hover:opacity-90"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-600 dark:text-slate-300">Select a thread.</div>
        )}
      </section>
    </div>
  );
}
