// src/app/sell/page.tsx (SERVER COMPONENT – no "use client")
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../api/auth/[...nextauth]/authOptions"; // <- fixed
import { prisma } from "../lib/prisma";
import SellClient from "./SellClient";

export default async function SellPage() {
  const session = await getServerSession(authOptions);

  // Must be logged in
  if (!(session as any)?.user?.id) {
    redirect("/signin?callbackUrl=/sell");
  }

  // Must have BOTH email & phone on the account
  const user = await prisma.user.findUnique({
    where: { id: (session as any).user.id },
    select: { email: true, phone: true },
  });

  if (!user?.email || !user?.phone) {
    const missing = !user?.email ? "email" : "phone";
    redirect(`/account/complete-profile?missing=${missing}`);
  }

  // All good – render the client form
  return <SellClient />;
}
