// src/app/service/[id]/edit/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

export const metadata: Metadata = {
  title: "Edit service • QwikSale",
  robots: { index: false, follow: false },
};

export default async function EditServicePage(props: any) {
  // Accept `any` to satisfy Next's PageProps checker, then read defensively
  const id = String(props?.params?.id ?? "");
  if (!id) notFound();

  // Require auth
  const session = await auth().catch(() => null);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/service/${id}/edit`)}`);
  }

  // Gate by ownership (hide if not owner)
  const s = await prisma.service
    .findUnique({ where: { id }, select: { sellerId: true } })
    .catch(() => null);

  if (!s) notFound();
  if (s.sellerId !== userId) notFound();

  // Reuse existing sell flow which knows how to prefill by ?id=
  redirect(`/sell/service?id=${encodeURIComponent(id)}`);
}
