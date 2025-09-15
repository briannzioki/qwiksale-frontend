export const dynamic = "force-dynamic";
export const revalidate = 0;

import { auth } from "@/auth";
import { notFound } from "next/navigation";
// Use a relative import to the client component to avoid TS path issues
import MessagesClient from "./MessagesClient.client";

export default async function MessagesPage() {
  const session = await auth().catch(() => null);
  const uid = (session?.user as any)?.id as string | undefined;
  if (!uid) {
    notFound(); // or render a sign-in CTA
  }

  return (
    <div className="container-page py-6 space-y-4">
      <h1 className="text-2xl font-bold">Messages</h1>
      <MessagesClient />
    </div>
  );
}
