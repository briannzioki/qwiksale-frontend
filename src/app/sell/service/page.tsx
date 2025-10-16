// src/app/sell/service/page.tsx
// Server component wrapper; do NOT add "use client" here.
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
  const sp = await searchParams; // Promise per Next.js typings
  const id = firstParam(sp, "id");

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
          <a
            href={`/signin?callbackUrl=${encodeURIComponent("/sell/service")}`}
            className="btn-outline"
          >
            Sign in
          </a>{" "}
          to unlock the full sell flow.
        </p>
      )}

      <SellServiceClient editId={id} />
    </main>
  );
}
