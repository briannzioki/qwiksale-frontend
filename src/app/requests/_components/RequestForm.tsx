// src/app/requests/_components/RequestForm.tsx
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
  onCreated,
}: {
  defaultKind?: "product" | "service";
  defaultTitle?: string;
  defaultCategory?: string;
  defaultLocation?: string;
  onCreated?: (id: string) => void;
}) {
  const [kind, setKind] = React.useState<"product" | "service">(defaultKind);
  const [title, setTitle] = React.useState(defaultTitle);
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState(defaultLocation);
  const [category, setCategory] = React.useState(defaultCategory);
  const [tagsRaw, setTagsRaw] = React.useState("");
  const [contactEnabled, setContactEnabled] = React.useState(true);
  const [contactMode, setContactMode] = React.useState<"chat" | "phone" | "whatsapp">("chat");

  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

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
        onCreated?.(id);
        window.location.assign(`/requests/${encodeURIComponent(id)}`);
        return;
      }

      window.location.assign("/requests");
    } catch (err: any) {
      setError(err?.message || "Could not create request.");
      setWorking(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <label className="block text-sm font-semibold">Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(safeKind(e.target.value))}
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </div>

        <div className="md:col-span-9">
          <label className="block text-sm font-semibold">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you looking for?"
            minLength={3}
            required
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
          <div className="mt-1 text-xs text-muted-foreground">
            Example: “iPhone 13 128GB” or “Plumber in Nairobi West”.
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Add details, budget, timing, preferred brands…"
          className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <label className="block text-sm font-semibold">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Nairobi, Kisumu…"
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>

        <div className="md:col-span-4">
          <label className="block text-sm font-semibold">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-sm font-semibold">Tags</label>
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="Comma-separated"
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <input
            id="contact-enabled"
            type="checkbox"
            checked={contactEnabled}
            onChange={(e) => setContactEnabled(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border text-[#161748] focus:ring-[#161748]"
          />
          <div className="min-w-0 flex-1">
            <label htmlFor="contact-enabled" className="block text-sm font-semibold">
              Enable contact
            </label>
            <div className="text-xs text-muted-foreground">
              If disabled, this becomes <b>message only</b> (no phone/WhatsApp prompts).
            </div>

            <div className="mt-3 max-w-xs">
              <label className="block text-xs font-semibold text-muted-foreground">
                Contact mode
              </label>
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
                className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-60"
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
        className="btn-gradient-primary disabled:opacity-60"
      >
        {working ? "Creating…" : "Create request"}
      </button>
    </form>
  );
}
