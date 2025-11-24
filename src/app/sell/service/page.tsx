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
    isAuthenticated = false;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">
        {isEdit ? "Edit Service" : "Sell a Service"}
      </h1>

      {!isAuthenticated && (
        <p className="mb-4 text-sm text-gray-700 dark:text-slate-200">
          <a
            href={`/signin?callbackUrl=${encodeURIComponent("/sell/service")}`}
            className="btn-outline"
          >
            Sign in
          </a>{" "}
          to unlock the full sell flow.
        </p>
      )}

      {/* Real implementation (create/edit) lives in SellServiceClient */}
      <SellServiceClient editId={id} isAuthenticated={isAuthenticated} />
    </main>
  );
}
