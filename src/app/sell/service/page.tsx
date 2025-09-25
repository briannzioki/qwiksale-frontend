// Server component wrapper; do NOT add "use client" here.
import SellServiceClient from "./SellServiceClient";

type SP = { id?: string };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { id } = await searchParams;
  // pass the correct prop name AND allow undefined via the client Prop type
  return <SellServiceClient editId={id} />;
}
