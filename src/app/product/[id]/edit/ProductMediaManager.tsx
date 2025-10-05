// src/app/product/[id]/edit/ProductMediaManager.tsx
"use client";

import EditMediaClient from "@/app/components/EditMediaClient";

type Img = { id: string; url: string; isCover?: boolean; sort?: number };

export default function ProductMediaManager(props: {
  productId: string;
  initial: Img[];
  max?: number;
}) {
  const { productId, initial, max = 10 } = props;
  return (
    <EditMediaClient entity="product" entityId={productId} initial={initial} max={max} />
  );
}
