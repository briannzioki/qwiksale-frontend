// src/app/sell/product/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import SellClient from "../SellClient";

export default function Page() {
  return <SellClient />;
}
