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

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const id = firstParam(sp, "id");
  const isEdit = Boolean(id && String(id).trim());

  // SSR auth sniff: look for next-auth cookie
  const cookieStore = await cookies();
  const authed = Boolean(
    cookieStore.get("__Secure-next-auth.session-token")?.value ||
      cookieStore.get("next-auth.session-token")?.value
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">Sell a Service</h1>

      {!authed && (
        <p className="mb-4">
          <a href={`/signin?callbackUrl=${encodeURIComponent("/sell/service")}`} className="btn-outline">
            Sign in
          </a>{" "}
          to unlock the full sell flow.
        </p>
      )}

      <form aria-label="Quick service details" className="mb-6" action="#" method="post">
        <div className="mb-4">
          <label htmlFor="ss-name" className="mb-1 block text-sm font-medium text-gray-700">
            Service Name
          </label>
        </div>
        <button type="button" className="rounded-lg bg-[#161748] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          {isEdit ? "Update" : "Save"}
        </button>
      </form>

      <SellServiceClient editId={id} />
    </main>
  );
}
