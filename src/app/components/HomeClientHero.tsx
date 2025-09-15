"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import UserAvatar from "@/app/components/UserAvatar";

export default function HomeClientHero() {
  const { data, status } = useSession();
  const user = data?.user as any;

  if (status !== "authenticated") return null;

  return (
    <div className="mb-4 rounded-xl bg-white border p-3 flex items-center gap-3 dark:bg-slate-900 dark:border-slate-800">
      <UserAvatar src={user?.image || null} alt="Me" size={28} />
      <div className="text-sm">
        Hi, <b>{user?.name || user?.username || "there"}</b> — welcome back!
      </div>
      <div className="ml-auto flex gap-2">
        <Link href="/sell" className="btn-gradient-primary text-sm">Post</Link>
        <Link href="/dashboard" className="btn-outline text-sm">Dashboard</Link>
      </div>
    </div>
  );
}
