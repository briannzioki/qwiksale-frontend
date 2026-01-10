export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import CarrierOnboardingClient from "./CarrierOnboardingClient";
import { requireUser } from "@/app/lib/authz";

function normalizeUsernameForLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/^@+/, "");
  if (!s) return null;
  return /^[a-z0-9._-]{2,64}$/i.test(s) ? s : null;
}

function displayNameForClient(u: any): string | null {
  const uname = normalizeUsernameForLabel(u?.username);
  if (uname) return `@${uname}`;
  if (typeof u?.name === "string" && u.name.trim()) return u.name.trim();
  if (typeof u?.email === "string" && u.email.trim()) return u.email.trim();
  return null;
}

export default async function CarrierOnboardingPage() {
  const authed = await requireUser({ callbackUrl: "/carrier/onboarding" });
  const userId = (authed as any).id as string;

  const anyPrisma = prisma as any;
  const carrierModel = anyPrisma?.carrierProfile;

  const existing =
    carrierModel && typeof carrierModel.findUnique === "function"
      ? await carrierModel
          .findUnique({ where: { userId }, select: { id: true } })
          .catch(() => null)
      : carrierModel && typeof carrierModel.findFirst === "function"
        ? await carrierModel
            .findFirst({ where: { userId }, select: { id: true } })
            .catch(() => null)
        : null;

  if (existing?.id) {
    redirect("/carrier");
  }

  // IMPORTANT: do NOT wrap in AppShell here; RootLayout already renders the site header/footer.
  // We DO provide a consistent page container so it aligns with other pages.
  return (
    <main
      className="container-page py-4 text-[var(--text)] sm:py-6"
      aria-label="Carrier onboarding page"
    >
      <CarrierOnboardingClient
        user={{
          id: userId,
          name: displayNameForClient(authed) ?? null,
          email: (authed as any).email ?? null,
        }}
      />
    </main>
  );
}
