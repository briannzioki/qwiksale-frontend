// src/app/product/[id]/edit/ProductMediaManager.tsx
"use client";

import { useMemo, useCallback, memo } from "react";
import EditMediaClient from "@/app/components/EditMediaClient";
import type { MediaManagerItemIn } from "@/app/components/MediaManager";

export type Img = { id: string; url: string; isCover?: boolean; sort?: number };

type Props = {
  productId: string;
  initial: Img[];
  max?: number; // hard-capped to 6
};

function normalize(initial: Img[], cap: number): MediaManagerItemIn[] {
  const CAP = Math.min(Math.max(1, cap || 6), 6);

  const seen = new Set<string>();
  const cleaned = (Array.isArray(initial) ? initial : [])
    .map((x, i): MediaManagerItemIn => {
      const id = String(x?.id ?? x?.url ?? `img-${i}-${(x?.url || "").slice(-10)}`);
      const url = String(x?.url || "").trim();
      const isCover = Boolean(x?.isCover) || undefined; // keep optional truly optional
      const sort =
        Number.isFinite(x?.sort) ? Number(x?.sort) :
        Number.isFinite((x as any)?.position) ? Number((x as any).position) :
        i;
      return { id, url, isCover, sort };
    })
    .filter((x) => x.url.length > 0 && !seen.has(x.url) && (seen.add(x.url), true));

  cleaned.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id));

  // Ensure cover at index 0
  let covIdx = cleaned.findIndex((x) => x.isCover === true);
  if (covIdx < 0 && cleaned.length > 0) covIdx = 0;
  if (covIdx > 0) {
    const [cov] = cleaned.splice(covIdx, 1);
    if (cov) cleaned.unshift({ ...cov, isCover: true });
  } else if (cleaned[0]) {
    cleaned[0].isCover = true;
  }

  return cleaned.slice(0, CAP);
}

function ProductMediaManagerBase({ productId, initial, max = 6 }: Props) {
  const normalized = useMemo(() => normalize(initial || [], max), [initial, max]);
  const hardMax = Math.min(Math.max(1, max || 6), 6);

  // Emit gallery update for preview UIs
  const onChange = useCallback((items: MediaManagerItemIn[]) => {
    const sorted = [...items].sort(
      (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id)
    );
    const cover = sorted.find((i) => i.isCover) ?? sorted[0];
    try {
      window.dispatchEvent(
        new CustomEvent("qs:gallery:update", {
          detail: {
            entity: "product",
            entityId: productId,
            coverUrl: cover?.url ?? null,
            coverId: cover?.id ?? null,
            orderIds: sorted.map((i) => i.id),
            orderUrls: sorted.map((i) => i.url),
            items: sorted,
          },
        })
      );
    } catch {}
  }, [productId]);

  const onPersist = useCallback(async () => {
    try {
      await fetch(`/api/products/${encodeURIComponent(productId)}/revalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    } catch {}
  }, [productId]);

  return (
    <EditMediaClient
      entity="product"
      entityId={productId}
      initial={normalized}
      max={hardMax}
      onChangeAction={onChange}
      onPersistAction={onPersist}
    />
  );
}

const ProductMediaManager = memo(ProductMediaManagerBase);
ProductMediaManager.displayName = "ProductMediaManager";
export default ProductMediaManager;
