// src/app/messages/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { auth } from "@/auth";
import { redirect } from "next/navigation";
// Use a relative import to the client component to avoid TS path issues
import MessagesClient from "./MessagesClient.client";

export default async function MessagesPage() {
  const session = await auth().catch(() => null);
  const uid = (session?.user as any)?.id as string | undefined;
  if (!uid) {
    // Friendlier than 404; send folks to sign in and back here
    redirect(`/signin?callbackUrl=${encodeURIComponent("/messages")}`);
  }

  return (
    <div className="container-page py-6 space-y-4">
      <h1 className="text-2xl font-bold">Messages</h1>
      <MessagesClient meId={uid!} />
    </div>
  );
}
