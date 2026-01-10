export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function isPrismaValidationError(err: unknown) {
  const e = err as any;
  const name = typeof e?.name === "string" ? e.name : "";
  const msg = typeof e?.message === "string" ? e.message : "";
  return (
    name === "PrismaClientValidationError" ||
    msg.includes("PrismaClientValidationError") ||
    msg.includes("Invalid value for argument") ||
    msg.includes("Unknown argument")
  );
}

function toIso(v: any) {
  try {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    const t = d.getTime();
    if (!Number.isFinite(t)) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

async function loadRequestById(id: string) {
  const requestModel = (prisma as any).request;

  // Prefer a richer select when available, but never crash on schema drift.
  const fullSelect = {
    id: true,
    kind: true,
    title: true,
    description: true,
    location: true,
    category: true,
    tags: true,
    createdAt: true,
    expiresAt: true,
    status: true,
    boostUntil: true,
    ownerId: true,
    owner: {
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
      },
    },
  };

  const minimalSelect = {
    id: true,
    kind: true,
    title: true,
    description: true,
    location: true,
    category: true,
    tags: true,
    createdAt: true,
    expiresAt: true,
    status: true,
    boostUntil: true,
    ownerId: true,
  };

  try {
    return await requestModel?.findUnique?.({ where: { id }, select: fullSelect });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/requests/[id]] prisma findUnique error (will fallback):", e);

    if (!isPrismaValidationError(e)) throw e;
    return await requestModel?.findUnique?.({ where: { id }, select: minimalSelect });
  }
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  const id = String((p as any)?.id || "").trim();

  if (!id) {
    redirect("/requests");
  }

  const session = await auth();
  const userAny = (session as any)?.user ?? null;

  // Canonical auth signal: session exists with a user identity.
  const isAuthed = Boolean(userAny && (userAny.id || userAny.email));

  const target = `/requests/${encodeURIComponent(id)}`;
  if (!isAuthed) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(target)}`);
  }

  let item: any = null;
  let loadError: string | null = null;

  try {
    const r = await loadRequestById(id);
    if (!r) {
      loadError = "Request not found.";
    } else {
      item = {
        ...r,
        createdAt: toIso(r?.createdAt),
        expiresAt: toIso(r?.expiresAt),
        boostUntil: toIso(r?.boostUntil),
      };
    }
  } catch {
    loadError = "Network error while loading request.";
  }

  const title = item?.title ? String(item.title) : "Request";
  const subtitle =
    item?.kind || item?.location
      ? [item?.kind ? String(item.kind) : null, item?.location ? String(item.location) : null]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <main className="container-page py-4 text-[var(--text)] sm:py-6" aria-label="Request detail">
      <header className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5">
        <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Request
        </div>

        <h1 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl md:text-3xl break-words">
          {title}
        </h1>

        {subtitle ? (
          <p className="mt-1 text-xs text-[var(--text-muted)] sm:text-sm">{subtitle}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href="/requests" prefetch={false} className="btn-outline text-xs sm:text-sm">
            Back to requests
          </Link>
          <Link href="/requests/new" prefetch={false} className="btn-gradient-primary text-xs sm:text-sm">
            Post a request
          </Link>
        </div>
      </header>

      {loadError ? (
        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-sm text-[var(--text)] shadow-sm sm:mt-4 sm:px-4">
          {loadError}
        </div>
      ) : (
        <section className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:mt-4 sm:p-5">
          {item?.description ? (
            <p className="text-sm leading-relaxed text-[var(--text)]">{String(item.description)}</p>
          ) : (
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              No description provided.
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            {item?.category ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-2.5 shadow-sm sm:p-3">
                <div className="text-xs font-semibold text-[var(--text-muted)]">Category</div>
                <div className="mt-1 font-semibold text-[var(--text)]">{String(item.category)}</div>
              </div>
            ) : null}

            {item?.status ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-2.5 shadow-sm sm:p-3">
                <div className="text-xs font-semibold text-[var(--text-muted)]">Status</div>
                <div className="mt-1 font-semibold text-[var(--text)]">{String(item.status)}</div>
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
        </section>
      )}
    </main>
  );
}
