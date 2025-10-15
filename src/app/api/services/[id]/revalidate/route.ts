import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id?: string }> }
) {
  const { id: raw } = await context.params;
  const id = (raw ?? "").trim();
  if (!id) return noStore({ error: "Missing id" }, { status: 400 });

  try {
    revalidateTag(`service:${id}`);
    revalidateTag(`listing:${id}`);
    revalidatePath(`/service/${id}`, "page");
    // ⬇️ Also revalidate the edit page for instant UI update after edits
    revalidatePath(`/service/${id}/edit`, "page");
    return noStore({ ok: true });
  } catch (e: any) {
    return noStore({ error: e?.message || "Revalidate failed" }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id?: string }> }
) {
  const { id: raw } = await context.params;
  const id = (raw ?? "").trim();
  if (!id) return noStore({ error: "Missing id" }, { status: 400 });

  try {
    revalidateTag(`service:${id}`);
    revalidateTag(`listing:${id}`);
    revalidatePath(`/service/${id}`, "page");
    revalidatePath(`/service/${id}/edit`, "page");
    return noStore({
      ok: true,
      revalidated: { id, paths: [`/service/${id}`, `/service/${id}/edit`], tags: [`service:${id}`, `listing:${id}`] },
    });
  } catch (e: any) {
    return noStore({ error: e?.message || "Revalidate failed" }, { status: 500 });
  }
}
