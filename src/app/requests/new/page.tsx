// src/app/requests/new/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { auth } from "@/auth";

type SP = Record<string, string | string[] | undefined>;
type HeadersLike = { get(name: string): string | null };

function getParam(sp: SP, key: string): string {
  const v = sp[key];
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v ?? "");
}

function baseUrlFromHeaders(h: HeadersLike): string {
  const env =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    "";
  if (env) return env.replace(/\/+$/, "");

  const proto =
    h.get("x-forwarded-proto") ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function makeApiUrl(path: string, h: HeadersLike): string {
  const base = baseUrlFromHeaders(h);
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

async function cookieHeaderFromNextCookies(): Promise<string> {
  try {
    const jar = await cookies();
    const all = jar.getAll();
    return all.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");
  } catch {
    return "";
  }
}

function safeKind(raw: string): "product" | "service" {
  const s = (raw || "").trim().toLowerCase();
  return s === "service" ? "service" : "product";
}

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const session = await auth();
  const meId = (session as any)?.user?.id as string | undefined;

  const kind = safeKind(getParam(sp, "kind"));
  const titlePrefill = getParam(sp, "title").trim();
  const returnQs = new URLSearchParams();
  if (kind) returnQs.set("kind", kind);
  if (titlePrefill) returnQs.set("title", titlePrefill);

  if (!meId) {
    const cb = `/requests/new${returnQs.toString() ? `?${returnQs.toString()}` : ""}`;
    redirect(`/signin?callbackUrl=${encodeURIComponent(cb)}`);
  }

  async function createRequest(formData: FormData) {
    "use server";

    const session2 = await auth();
    const uid = (session2 as any)?.user?.id as string | undefined;
    if (!uid) {
      redirect(`/signin?callbackUrl=${encodeURIComponent("/requests/new")}`);
    }

    const kindFd = safeKind(String(formData.get("kind") || "product"));
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const location = String(formData.get("location") || "").trim();
    const category = String(formData.get("category") || "").trim();
    const tagsRaw = String(formData.get("tags") || "").trim();
    const contactEnabled = String(formData.get("contactEnabled") || "") === "1";
    const contactMode = String(formData.get("contactMode") || "").trim();

    if (!title || title.length < 3) {
      const qs = new URLSearchParams();
      qs.set("kind", kindFd);
      qs.set("title", title);
      qs.set("error", "title");
      redirect(`/requests/new?${qs.toString()}`);
    }

    const tags = tagsRaw
      ? tagsRaw
          .split(/[,\n]/g)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 12)
      : [];

    const h = await headers();
    const url = makeApiUrl("/api/requests", h);
    const cookieHeader = await cookieHeaderFromNextCookies();

    let createdId: string | null = null;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: JSON.stringify({
          kind: kindFd,
          title,
          description,
          location,
          category,
          tags,
          contactEnabled,
          contactMode: contactMode || undefined,
        }),
        cache: "no-store",
      });

      const j = await res.json().catch(() => null);

      if (!res.ok || j?.error) {
        const qs = new URLSearchParams();
        qs.set("kind", kindFd);
        qs.set("title", title);
        qs.set("error", "create");
        redirect(`/requests/new?${qs.toString()}`);
      }

      createdId = String(j?.id || j?.request?.id || "");
    } catch {
      const qs = new URLSearchParams();
      qs.set("kind", kindFd);
      qs.set("title", title);
      qs.set("error", "network");
      redirect(`/requests/new?${qs.toString()}`);
    }

    if (createdId) {
      redirect(`/requests/${encodeURIComponent(createdId)}`);
    }

    redirect("/requests");
  }

  const error = getParam(sp, "error").trim();

  return (
    <main className="container-page py-6">
      <div className="hero-surface">
        <h1 className="text-2xl md:text-3xl font-extrabold">Post a request</h1>
        <p className="text-sm text-white/80">Tell QwikSale what you need. We’ll surface it to sellers.</p>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error === "title"
            ? "Title is required (min 3 characters)."
            : "Could not create request. Please try again."}
        </div>
      ) : null}

      <form
        action={createRequest}
        className="mt-6 rounded-2xl border border-border bg-card/90 p-6 shadow-sm space-y-4"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className="block text-sm font-semibold">Kind</label>
            <select
              name="kind"
              defaultValue={kind}
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>

          <div className="md:col-span-9">
            <label className="block text-sm font-semibold">Title</label>
            <input
              name="title"
              defaultValue={titlePrefill}
              placeholder="What are you looking for?"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
              minLength={3}
              required
            />
            <div className="mt-1 text-xs text-muted-foreground">
              Example: “iPhone 13 128GB, good condition” or “Plumber in Nairobi West”.
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold">Description</label>
          <textarea
            name="description"
            rows={5}
            placeholder="Add details, budget range, timing, preferred brands, etc."
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <label className="block text-sm font-semibold">Location</label>
            <input
              name="location"
              placeholder="e.g. Nairobi, Kisumu, Mombasa…"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-sm font-semibold">Category</label>
            <input
              name="category"
              placeholder="Optional"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm font-semibold">Tags</label>
            <input
              name="tags"
              placeholder="Comma-separated"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <input
              id="contactEnabled"
              name="contactEnabled"
              type="checkbox"
              value="1"
              defaultChecked
              className="mt-1 h-4 w-4 rounded border-border text-[#161748] focus:ring-[#161748]"
            />
            <div className="min-w-0">
              <label htmlFor="contactEnabled" className="block text-sm font-semibold">
                Enable contact
              </label>
              <div className="text-xs text-muted-foreground">
                If enabled, sellers may reach you based on your account contact settings.
              </div>

              <div className="mt-3 max-w-xs">
                <label className="block text-xs font-semibold text-muted-foreground">Contact mode</label>
                <select
                  name="contactMode"
                  defaultValue="chat"
                  className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
                >
                  <option value="chat">Chat</option>
                  <option value="phone">Phone</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-gradient-primary">
            Create request
          </button>
          <Link href="/requests" prefetch={false} className="btn-outline">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
