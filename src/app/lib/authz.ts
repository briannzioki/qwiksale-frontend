import { getServerSession } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";

/** Parse ADMIN_EMAILS into a fast set */
function adminEmailSet() {
  const raw = process.env.ADMIN_EMAILS || "";
  const set = new Set<string>();
  for (const e of raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)) {
    set.add(e);
  }
  return set;
}

export async function isAdminUser(): Promise<boolean> {
  const session = await getServerSession();
  const email = session?.user?.email?.toLowerCase();
  const id = (session?.user as any)?.id as string | undefined;
  if (!session?.user) return false;

  // quick email allowlist
  const allow = adminEmailSet();
  if (email && allow.has(email)) return true;

  // fall back to DB role
  if (!id) return false;
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  return u?.role === "ADMIN";
}

/** Redirect to signin if not admin */
export async function requireAdmin(path = "/admin") {
  const session = await getServerSession();
  if (!session?.user) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(path)}`);
  }
  if (!(await isAdminUser())) {
    redirect("/"); // or a 403 page
  }
}
