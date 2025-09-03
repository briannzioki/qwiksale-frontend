import Link from "next/link";
import { requireAdmin } from "@/app/lib/authz";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");

  return (
    <div className="p-6 space-y-6">
      <header className="rounded-2xl p-6 text-white bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">Admin</h1>
          <nav className="flex gap-3">
            <Link href="/admin" className="rounded-xl bg-white/15 px-3 py-1">Dashboard</Link>
            <Link href="/" className="rounded-xl bg-white/15 px-3 py-1">Site</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
