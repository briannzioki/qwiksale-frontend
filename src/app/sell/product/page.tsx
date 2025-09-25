// Server component wrapper; do NOT add "use client" here.
import SellProductClient from "./SellProductClient";

type SP = { id?: string };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { id } = await searchParams;
  return <SellProductClient id={id} />;
}
