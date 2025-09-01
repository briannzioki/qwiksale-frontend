// src/app/sell/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth"; // ✅ v5 helper
import SellClient from "./SellClient";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  const session = await auth();

  // Not signed in → send to /signin and come back to /sell after
  if (!session?.user) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/sell")}`);
  }

  // Signed in: let them post even if the profile isn't complete yet.
  return <SellClient />;
}
