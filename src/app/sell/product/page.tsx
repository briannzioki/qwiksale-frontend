// src/app/sell/product/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import SellProductClient from "./SellProductClient";

export default function Page() {
  return <SellProductClient />;
}
