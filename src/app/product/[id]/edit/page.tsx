export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

export const metadata: Metadata = {
  title: "Edit listing • QwikSale",
  robots: { index: false, follow: false },
};

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Require auth
  const session = await auth().catch(() => null);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/product/${id}/edit`)}`);
  }

  // Gate by ownership (hide if not owner)
  const p = await prisma.product
    .findUnique({ where: { id }, select: { sellerId: true } })
    .catch(() => null);

  if (!p) notFound();
  if (p.sellerId !== userId) notFound();

  // Reuse existing sell flow which knows how to prefill by ?id=
  redirect(`/sell/product?id=${encodeURIComponent(id)}`);
}
