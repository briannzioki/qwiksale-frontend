export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

type Body = {
  /** Extra paths to revalidate in addition to /product/[id] */
  paths?: string[];
  /** Cache tags to revalidate (if you use tagged revalidation) */
  tags?: string[];
};

async function maybeIdempotency(req: Request) {
  // Optional: if you added a helper, use it; otherwise no-op.
  try {
    const mod = await import("@/app/lib/idempotency");
    const fn =
      (mod as any).ensureRequestIdempotent ??
      (mod as any).assertIdempotent ??
      (mod as any).consumeIdempotencyKey;
    if (typeof fn === "function") {
      await fn(req);
    }
  } catch {
    // Best-effort: idempotency helper not present — proceed.
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id?: string }> }
) {
  const { id: raw } = await context.params;
  const id = (raw ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing product id." }, { status: 400 });
  }

  await maybeIdempotency(req);

  let payload: Body = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      payload = (await req.json()) as Body;
    }
  } catch {
    /* ignore malformed body */
  }

  // Always revalidate the product page (+ edit)
  const paths = new Set<string>([
    `/product/${encodeURIComponent(id)}`,
    `/product/${encodeURIComponent(id)}/edit`,
  ]);

  // Optionally revalidate common surfaces
  paths.add("/"); // homepage / feed

  // Add any caller-provided extra paths
  (payload.paths ?? []).forEach((p) => {
    const s = String(p || "").trim();
    if (s) paths.add(s.startsWith("/") ? s : `/${s}`);
  });

  // Perform path revalidation
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // best-effort
    }
  }

  // Optional: tag-based revalidation if you use it
  const tags = new Set<string>(payload.tags ?? []);
  // If your data fetches are tagged, uncomment or customize:
  // tags.add(`product:${id}`);
  for (const t of tags) {
    try {
      revalidateTag(t);
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json(
    {
      ok: true,
      revalidated: {
        id,
        paths: Array.from(paths),
        tags: Array.from(tags),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id?: string }> }
) {
  // Convenience GET for manual pokes (e.g., curl / browser)
  const { id: raw } = await context.params;
  const id = (raw ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing product id." }, { status: 400 });
  }

  try {
    revalidatePath(`/product/${encodeURIComponent(id)}`);
    revalidatePath(`/product/${encodeURIComponent(id)}/edit`);
    revalidatePath("/");
  } catch {
    /* ignore */
  }

  return NextResponse.json(
    { ok: true, revalidated: { id, paths: [`/product/${id}`, `/product/${id}/edit`, `/`] } },
    { headers: { "Cache-Control": "no-store" } }
  );
}
