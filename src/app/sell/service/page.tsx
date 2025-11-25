// src/app/sell/service/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import SellServiceClient from "./SellServiceClient";
import { getSessionUser } from "@/app/lib/authz";

type SP = Record<string, string | string[] | undefined>;

function firstParam(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const id = firstParam(sp, "id");
  const isEdit = Boolean(id && String(id).trim());

  let isAuthenticated = false;
  try {
    const viewer = await getSessionUser();
    if (viewer && viewer.id) {
      isAuthenticated = true;
    }
  } catch {
    // Soft page – do not let auth lookup failures 500 this route.
    isAuthenticated = false;
  }

  return (
    <main className="container-page py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Hero / context */}
        <div className="rounded-2xl bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue p-6 text-white shadow-soft dark:shadow-none">
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            {isEdit ? "Edit Service" : "Sell a Service"}
          </h1>
          <p className="mt-2 text-sm text-white/90">
            Describe what you do, where you operate, and how people can reach you.
            You can tweak or pause the service any time.
          </p>
        </div>

        {/* Guest warning */}
        {!isAuthenticated && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <p>
              <a
                href={`/signin?callbackUrl=${encodeURIComponent("/sell/service")}`}
                className="font-semibold underline"
              >
                Sign in
              </a>{" "}
              to unlock the full sell flow for your services.
            </p>
          </div>
        )}

        {/* Real implementation (create/edit) lives in SellServiceClient */}
        <section
          aria-label={isEdit ? "Edit service form" : "Sell service form"}
          className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm"
        >
          <SellServiceClient editId={id} isAuthenticated={isAuthenticated} />
        </section>
      </div>
    </main>
  );
}
