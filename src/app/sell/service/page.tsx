// src/app/sell/service/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import SellServiceClient from "./SellServiceClient";

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

  // SSR auth sniff: look for next-auth cookie
  const cookieStore = await cookies();
  const authed = Boolean(
    cookieStore.get("__Secure-next-auth.session-token")?.value ||
      cookieStore.get("next-auth.session-token")?.value,
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">Sell a Service</h1>

      {!authed && (
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

      {/* Tiny SSR-visible “quick details” stub; does not own the real flow */}
      <form
        aria-label="Quick service details"
        className="mb-6 space-y-3"
        action="#"
        method="post"
      >
        <div>
          <label
            htmlFor="ss-name"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200"
          >
            Service Name
          </label>
          <input
            id="ss-name"
            name="name"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="E.g. House cleaning, plumbing, makeup artist…"
          />
        </div>
        <button
          type="button"
          className="rounded-lg bg-[#161748] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-[#39a0ca] dark:hover:bg-[#39a0ca]/90"
        >
          {isEdit ? "Update" : "Save"}
        </button>
      </form>

      {/* Real implementation (create/edit) lives in SellServiceClient */}
      <SellServiceClient editId={id} />
    </main>
  );
}
