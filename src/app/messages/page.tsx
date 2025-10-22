// src/app/messages/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { auth } from "@/auth";
import { redirectIfDifferent } from "@/app/lib/safeRedirect";
import MessagesClient from "./MessagesClient.client";

export default async function MessagesPage() {
  const session = await auth().catch(() => null);
  const uid = (session?.user as any)?.id as string | undefined;
  if (!uid) {
    const here = "/messages";
    const target = `/signin?callbackUrl=${encodeURIComponent(here)}`;
    redirectIfDifferent(target, here);
  }

  return (
    <div className="container-page py-6 space-y-4">
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <h1 className="text-2xl md:text-3xl font-extrabold">Messages</h1>
        <p className="text-white/90">Chat with buyers and sellers in real-time.</p>
      </div>

      <MessagesClient meId={uid!} />
    </div>
  );
}
