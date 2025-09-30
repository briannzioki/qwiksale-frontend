// src/app/sell/service/page.tsx
// Server component wrapper; do NOT add "use client" here.
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
  return <SellServiceClient editId={id} />;
}
