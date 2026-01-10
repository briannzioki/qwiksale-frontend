export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";

import DeliveryClient from "./DeliveryClient";
import { requireUser } from "@/app/lib/authz";

type SearchParams = Record<string, string | string[] | undefined>;

function pickFirst(v: string | string[] | undefined): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) return (v[0] ?? "").trim() || null;
  return null;
}

function buildCallbackUrl(sp?: SearchParams) {
  const base = "/delivery";
  if (!sp) return base;

  const qs = new URLSearchParams();
  for (const [k, raw] of Object.entries(sp)) {
    const v = pickFirst(raw);
    if (!v) continue;
    qs.set(k, v);
  }

  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const cb = buildCallbackUrl(sp);

  const authed = await requireUser({ callbackUrl: cb });
  const userId = authed.id;

  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(cb)}`);
  }

  const initial = {
    near: pickFirst(sp["near"]) ?? null,
    productId: pickFirst(sp["productId"]) ?? null,
    storeId: pickFirst(sp["storeId"]) ?? null,
    q: pickFirst(sp["q"]) ?? null,
  };

  // IMPORTANT: do NOT wrap in AppShell here; RootLayout already renders the site header/footer.
  return (
    <main className="container-page py-4 text-[var(--text)] sm:py-6" aria-label="Delivery">
      <DeliveryClient initialSearchParams={initial} />
    </main>
  );
}
