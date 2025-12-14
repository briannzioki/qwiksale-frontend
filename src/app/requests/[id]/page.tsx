// src/app/requests/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { auth } from "@/auth";

type RequestDetail = {
  id: string;
  kind?: "product" | "service" | string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  category?: string | null;
  tags?: string[] | string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  boostUntil?: string | null;
  status?: string | null;
  contactEnabled?: boolean | null;
  contactMode?: string | null;
};

type HeadersLike = { get(name: string): string | null };

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

function fmtDateTime(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function asDetail(json: any): RequestDetail | null {
  if (!json) return null;
  if (json?.request && typeof json.request === "object") return json.request as RequestDetail;
  if (typeof json === "object") return json as RequestDetail;
  return null;
}

export default async function RequestDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rid = String(id || "").trim();

  const session = await auth();
  const meId = (session as any)?.user?.id as string | undefined;
  if (!meId) {
    const cb = `/requests/${encodeURIComponent(rid)}`;
    redirect(`/signin?callbackUrl=${encodeURIComponent(cb)}`);
  }

  const h = await headers();
  const url = makeApiUrl(`/api/requests/${encodeURIComponent(rid)}`, h);
  const cookieHeader = await cookieHeaderFromNextCookies();

  let r: RequestDetail | null = null;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });
    const j = await res.json().catch(() => null);
    if (res.ok) r = asDetail(j);
  } catch {
    r = null;
  }

  if (!r) {
    return (
      <main className="container-page py-6">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold">Request</h1>
          <p className="text-sm text-white/80">Could not load this request.</p>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card/90 p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">
            This request may have been removed or the link is invalid.
          </div>
          <div className="mt-4">
            <Link href="/requests" prefetch={false} className="btn-outline">
              Back to Requests
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const created = fmtDateTime(r.createdAt);
  const expires = fmtDateTime(r.expiresAt);
  const boosted = !!(r.boostUntil && new Date(r.boostUntil).getTime() > Date.now());

  const tagsArr = Array.isArray(r.tags)
    ? r.tags
    : typeof r.tags === "string"
      ? r.tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  return (
    <main className="container-page py-6">
      <div className="hero-surface">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-white/80">
              {String(r.kind || "request")}
              {boosted ? " • boosted" : ""}
            </div>
            <h1 className="mt-1 text-2xl md:text-3xl font-extrabold">{r.title || "Untitled"}</h1>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
            {r.status || "ACTIVE"}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/80">
          {r.location ? <span>{r.location}</span> : null}
          {r.location && r.category ? (
            <span className="opacity-60" aria-hidden>
              •
            </span>
          ) : null}
          {r.category ? <span>{r.category}</span> : null}
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card/90 p-6 shadow-sm space-y-4">
        <div className="grid gap-2 text-sm text-muted-foreground">
          {created ? (
            <div>
              <span className="font-semibold text-foreground">Posted:</span> {created}
            </div>
          ) : null}
          {expires ? (
            <div>
              <span className="font-semibold text-foreground">Expires:</span> {expires}
            </div>
          ) : null}
        </div>

        {r.description ? (
          <div>
            <h2 className="text-sm font-semibold text-foreground">Details</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{r.description}</p>
          </div>
        ) : null}

        {tagsArr.length ? (
          <div>
            <h2 className="text-sm font-semibold text-foreground">Tags</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tagsArr.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="text-sm font-semibold text-foreground">Contact</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {r.contactEnabled === false
              ? "Contact is disabled for this request."
              : `Contact is enabled${r.contactMode ? ` (${r.contactMode})` : ""}.`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Link href="/requests" prefetch={false} className="btn-outline">
            Back to Requests
          </Link>
          <Link href="/messages" prefetch={false} className="btn-gradient-primary">
            Messages
          </Link>
        </div>
      </section>
    </main>
  );
}
