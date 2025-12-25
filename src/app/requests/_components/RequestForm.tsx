"use client";

import * as React from "react";

type CreateBody = {
  kind: "product" | "service";
  title: string;
  description?: string;
  location?: string;
  category?: string;
  tags?: string[];
  contactEnabled?: boolean;
  contactMode?: string;
};

function safeKind(v: string): "product" | "service" {
  const s = (v || "").trim().toLowerCase();
  return s === "service" ? "service" : "product";
}

function normalizeTags(raw: string) {
  return raw
    .split(/[,\n]/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export default function RequestForm({
  defaultKind = "product",
  defaultTitle = "",
  defaultCategory = "",
  defaultLocation = "",
  onCreatedAction,
  onCreated,
}: {
  defaultKind?: "product" | "service";
  defaultTitle?: string;
  defaultCategory?: string;
  defaultLocation?: string;
  // Use the *Action suffix to satisfy Next's serializable-props rule.
  // Keep `onCreated` as unknown for backward compatibility without tripping the rule.
  onCreatedAction?: (id: string) => void;
  onCreated?: unknown;
}) {
  const [kind, setKind] = React.useState<"product" | "service">(defaultKind);
  const [title, setTitle] = React.useState(defaultTitle);
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState(defaultLocation);
  const [category, setCategory] = React.useState(defaultCategory);
  const [tagsRaw, setTagsRaw] = React.useState("");
  const [contactEnabled, setContactEnabled] = React.useState(true);
  const [contactMode, setContactMode] = React.useState<
    "chat" | "phone" | "whatsapp"
  >("chat");

  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  const notifyCreated = React.useCallback(
    (id: string) => {
      const fn =
        onCreatedAction ??
        (typeof onCreated === "function"
          ? (onCreated as (id: string) => void)
          : undefined);
      fn?.(id);
    },
    [onCreatedAction, onCreated],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;

    const t = title.trim();
    if (t.length < 3) {
      setError("Title is required (min 3 characters).");
      return;
    }

    setError(null);
    setWorking(true);

    const d = description.trim();
    const loc = location.trim();
    const cat = category.trim();
    const tags = tagsRaw ? normalizeTags(tagsRaw) : [];

    const body: CreateBody = {
      kind: safeKind(kind),
      title: t,
      ...(d ? { description: d } : {}),
      ...(loc ? { location: loc } : {}),
      ...(cat ? { category: cat } : {}),
      ...(tags.length ? { tags } : {}),
      contactEnabled,
      contactMode: contactEnabled ? contactMode : "message_only",
    };

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      const j: any = await res.json().catch(() => null);
      if (!res.ok || j?.error) {
        throw new Error(j?.error || `Failed (${res.status})`);
      }

      const id = String(j?.id || j?.request?.id || "");
      if (id) {
        notifyCreated(id);
        window.location.assign(`/requests/${encodeURIComponent(id)}`);
        return;
      }

      window.location.assign("/requests");
    } catch (err: any) {
      setError(err?.message || "Could not create request.");
      setWorking(false);
    }
  }

  const labelSm = "block text-sm font-semibold text-[var(--text)]";
  const labelXs = "block text-xs font-semibold text-[var(--text-muted)]";
  const inputBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const selectBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const textareaBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  return (
    <form onSubmit={onSubmit} className="space-y-4 text-[var(--text)]" noValidate>
      {error ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text)]">
          <span className="font-semibold">Error:</span> {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <label className={labelSm}>Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(safeKind(e.target.value))}
            className={selectBase}
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </div>

        <div className="md:col-span-9">
          <label className={labelSm}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you looking for?"
            minLength={3}
            required
            className={inputBase}
          />
          <div className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
            Example: “iPhone 13 128GB” or “Plumber in Nairobi West”.
          </div>
        </div>
      </div>

      <div>
        <label className={labelSm}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Add details, budget, timing, preferred brands…"
          className={textareaBase}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <label className={labelSm}>Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Nairobi, Kisumu…"
            className={inputBase}
          />
        </div>

        <div className="md:col-span-4">
          <label className={labelSm}>Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Optional"
            className={inputBase}
          />
        </div>

        <div className="md:col-span-3">
          <label className={labelSm}>Tags</label>
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="Comma-separated"
            className={inputBase}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <input
            id="contact-enabled"
            type="checkbox"
            checked={contactEnabled}
            onChange={(e) => setContactEnabled(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border border-[var(--border-subtle)] bg-[var(--bg)] accent-[var(--text)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
          <div className="min-w-0 flex-1">
            <label htmlFor="contact-enabled" className={labelSm}>
              Enable contact
            </label>
            <div className="text-xs text-[var(--text-muted)] leading-relaxed">
              If disabled, this becomes <b>message only</b> (no phone/WhatsApp prompts).
            </div>

            <div className="mt-3 max-w-xs">
              <label className={labelXs}>Contact mode</label>
              <select
                value={contactMode}
                onChange={(e) =>
                  setContactMode(
                    (e.target.value as any) === "phone"
                      ? "phone"
                      : (e.target.value as any) === "whatsapp"
                        ? "whatsapp"
                        : "chat",
                  )
                }
                disabled={!contactEnabled}
                className={[selectBase, "disabled:opacity-60"].join(" ")}
              >
                <option value="chat">Chat</option>
                <option value="phone">Phone</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={working}
        className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-60 sm:px-4 sm:text-sm"
      >
        {working ? "Creating…" : "Create request"}
      </button>
    </form>
  );
}
