export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { auth } from "@/auth";
import SectionHeader from "@/app/components/SectionHeader";

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
    return all
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join("; ");
  } catch {
    return "";
  }
}

function asItem(json: any) {
  if (!json) return null;
  if (json?.item) return json.item;
  if (json?.request) return json.request;
  if (json?.data) return json.data;
  return json;
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  const id = String((p as any)?.id || "").trim();

  const session = await auth();
  const meId = (session as any)?.user?.id as string | undefined;

  const target = `/requests/${encodeURIComponent(id)}`;
  if (!meId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(target)}`);
  }

  const h = await headers();
  const url = makeApiUrl(`/api/requests/${encodeURIComponent(id)}`, h);
  const cookieHeader = await cookieHeaderFromNextCookies();

  let item: any = null;
  let loadError: string | null = null;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });

    const j = await res.json().catch(() => null);

    if (!res.ok || (j as any)?.error) {
      loadError =
        (j as any)?.error ||
        (j as any)?.message ||
        `Could not load request (HTTP ${res.status}).`;
    } else {
      const raw = asItem(j);
      if (raw?.id) item = raw;
      if (!item) loadError = "Could not load request.";
    }
  } catch {
    loadError = "Network error while loading request.";
  }

  const title = item?.title ? String(item.title) : "Request";

  return (
    <main className="container-page py-4 text-[var(--text)] sm:py-6">
      <SectionHeader
        title={title}
        subtitle={
          item?.kind || item?.location
            ? [
                item?.kind ? String(item.kind) : null,
                item?.location ? String(item.location) : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : null
        }
        gradient="none"
        as="h1"
      />

      {loadError ? (
        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-sm text-[var(--text)] shadow-sm sm:mt-4 sm:px-4">
          {loadError}
        </div>
      ) : (
        <section className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:mt-4 sm:p-5">
          {item?.description ? (
            <p className="text-sm leading-relaxed text-[var(--text)]">
              {String(item.description)}
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              No description provided.
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            {item?.category ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-2.5 shadow-sm sm:p-3">
                <div className="text-xs font-semibold text-[var(--text-muted)]">
                  Category
                </div>
                <div className="mt-1 font-semibold text-[var(--text)]">
                  {String(item.category)}
                </div>
              </div>
            ) : null}

            {item?.status ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-2.5 shadow-sm sm:p-3">
                <div className="text-xs font-semibold text-[var(--text-muted)]">
                  Status
                </div>
                <div className="mt-1 font-semibold text-[var(--text)]">
                  {String(item.status)}
                </div>
              </div>
            ) : null}
          </div>

          {Array.isArray(item?.tags) && item.tags.length ? (
            <div className="mt-4 flex gap-1.5 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible sm:whitespace-normal">
              {item.tags.slice(0, 12).map((t: any) => (
                <span
                  key={String(t)}
                  className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
                >
                  {String(t)}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5">
            <Link
              href="/requests"
              prefetch={false}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-4 sm:text-sm"
            >
              Back to requests
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
