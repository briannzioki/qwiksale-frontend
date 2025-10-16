// src/app/product/[id]/edit/ProductMediaManager.tsx
"use client";

import { useMemo, useCallback, memo, useRef, useState, useEffect } from "react";
import EditMediaClient, { type EditMediaClientHandle } from "@/app/components/EditMediaClient";
import type { MediaManagerItemIn } from "@/app/components/MediaManager";
import { toast } from "@/app/components/ToasterClient";

export type Img = { id: string; url: string; isCover?: boolean; sort?: number };

type Props = {
  productId: string;
  initial: Img[];
  max?: number; // hard-capped to 6
};

/* ----------------------------- Normalization ---------------------------- */

function normalize(initial: Img[], cap: number): MediaManagerItemIn[] {
  const CAP = Math.min(Math.max(1, cap || 6), 6);
  const seen = new Set<string>();

  const cleaned = (Array.isArray(initial) ? initial : [])
    .map((x, i): MediaManagerItemIn => {
      const id = String(x?.id ?? x?.url ?? `img-${i}-${(x?.url || "").slice(-10)}`);
      const url = String(x?.url || "").trim();
      const isCover = Boolean(x?.isCover) || undefined;
      const sort =
        Number.isFinite(x?.sort) ? Number(x?.sort) :
        Number.isFinite((x as any)?.position) ? Number((x as any).position) :
        i;
      return { id, url, isCover, sort };
    })
    .filter((x) => x.url.length > 0 && !seen.has(x.url) && (seen.add(x.url), true))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id));

  // Ensure a single cover at index 0
  let covIdx = cleaned.findIndex((x) => x.isCover === true);
  if (covIdx < 0 && cleaned.length > 0) covIdx = 0;
  if (covIdx > 0) {
    const removed = cleaned.splice(covIdx, 1);
    const cov = removed[0];
    if (cov) cleaned.unshift({ id: cov.id, url: cov.url, isCover: true, sort: cov.sort });
  } else if (cleaned[0]) {
    cleaned[0] = { ...cleaned[0], isCover: true };
  }

  return cleaned.slice(0, CAP);
}

function urlsSignature(list: MediaManagerItemIn[]): string {
  // Compare by ordered URL list + cover position to detect real differences
  const coverIdx = list.findIndex((x) => x.isCover);
  return JSON.stringify({
    cover: coverIdx >= 0 ? coverIdx : 0,
    urls: list.map((x) => x.url),
  });
}

/* ------------------------------ Component ------------------------------- */

function ProductMediaManagerBase({ productId, initial, max = 6 }: Props) {
  const hardMax = Math.min(Math.max(1, max || 6), 6);

  // canonical "initial" at page load (normalized)
  const [initialCanon, setInitialCanon] = useState<MediaManagerItemIn[]>(
    () => normalize(initial || [], hardMax)
  );

  // live draft while user edits (starts from canonical)
  const [draft, setDraft] = useState<MediaManagerItemIn[]>(initialCanon);

  // for equality checks (avoid no-op commits)
  const [sigInitial, setSigInitial] = useState(() => urlsSignature(initialCanon));
  const [sigDraft, setSigDraft] = useState(() => urlsSignature(initialCanon));

  // keep normalized if props.initial changes (rare on edit page)
  useEffect(() => {
    const norm = normalize(initial || [], hardMax);
    setInitialCanon(norm);
    setDraft(norm);
    setSigInitial(urlsSignature(norm));
    setSigDraft(urlsSignature(norm));
  }, [initial, hardMax]);

  // hook into the child imperative API
  const childRef = useRef<EditMediaClientHandle | null>(null);

  /* -------------------------- Draft change wiring ------------------------- */

  const onDraftChange = useCallback(
    (items: MediaManagerItemIn[]) => {
      // keep a sorted/stable copy locally
      const sorted = [...items].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id)
      );

      setDraft(sorted);
      setSigDraft(urlsSignature(sorted));

      // page-local “draft” broadcast (for live preview panels)
      try {
        const cover = sorted.find((i) => i.isCover) ?? sorted[0];
        window.dispatchEvent(
          new CustomEvent("qs:gallery:draft", {
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
      } catch {
        /* no-op */
      }
    },
    [productId]
  );

  /* ----------------------------- Commit logic ---------------------------- */

  const commitDraft = useCallback(async () => {
    // no staged changes → nothing to do
    if (sigDraft === sigInitial) {
      toast.success("Photos are already up to date.");
      return { image: initialCanon[0]?.url ?? null, gallery: initialCanon.map((x) => x.url) };
    }

    try {
      // use child's commit() which PATCHes /media and optionally DELETEs removed
      const res = await childRef.current?.commit();
      if (!res) throw new Error("Commit failed.");

      // success → promote draft to new canonical
      const canonical: MediaManagerItemIn[] = (res.gallery || []).map((u, i) => ({
        id: u,
        url: u,
        isCover: i === 0,
        sort: i,
      }));

      setInitialCanon(canonical);
      setSigInitial(urlsSignature(canonical));

      setDraft(canonical);
      setSigDraft(urlsSignature(canonical));

      // global canonical broadcast (widgets outside this component)
      try {
        window.dispatchEvent(
          new CustomEvent("qs:gallery:canonical", {
            detail: {
              entity: "product",
              id: productId,
              image: res.image ?? null,
              gallery: Array.isArray(res.gallery) ? res.gallery : [],
            },
          })
        );
      } catch {
        /* ignore */
      }

      toast.success("Photos saved.");
      return res;
    } catch (e: any) {
      toast.error(e?.message || "Couldn’t save photos.");
      throw e;
    }
  }, [sigDraft, sigInitial, initialCanon, productId]);

  // Expose commitDraft globally so the “Update Product” button can trigger it
  useEffect(() => {
    const key = `product:${productId}:media`;
    const w = window as unknown as {
      qsCommitters?: Record<string, () => Promise<unknown>>;
    };
    if (!w.qsCommitters) w.qsCommitters = {};
    w.qsCommitters[key] = commitDraft;

    // Also listen for an event trigger, for form-based pages:
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent).detail || {};
      if (d?.entity === "product" && d?.id === productId && d?.scope === "media") {
        void commitDraft();
      }
    };
    window.addEventListener("qs:commit", handler as EventListener);

    return () => {
      if (w.qsCommitters && w.qsCommitters[key]) delete w.qsCommitters[key];
      window.removeEventListener("qs:commit", handler as EventListener);
    };
  }, [productId, commitDraft]);

  /* --------------------------- Persist callback --------------------------- */

  // Only fires after a successful commit (EditMediaClient calls it post-PATCH)
  const onPersist = useCallback(
    async (p?: { image?: string | null; gallery?: string[] }) => {
      try {
        // Soft poke a revalidate endpoint if you keep one; ignore failures
        await fetch(`/api/products/${encodeURIComponent(productId)}/revalidate`, {
          method: "POST",
          cache: "no-store",
          credentials: "include",
        }).catch(() => {});
        if (p && ("image" in p || "gallery" in p)) {
          try {
            window.dispatchEvent(
              new CustomEvent("qs:gallery:canonical", {
                detail: {
                  entity: "product",
                  id: productId,
                  image: p.image ?? null,
                  gallery: Array.isArray(p.gallery) ? p.gallery : [],
                },
              })
            );
          } catch {
            /* ignore */
          }
        }
        // toast handled in commitDraft (avoid double toasts)
      } catch {
        /* ignore */
      }
    },
    [productId]
  );

  /* --------------------------------- Render -------------------------------- */

  return (
    <EditMediaClient
      ref={childRef}
      entity="product"
      entityId={productId}
      initial={initialCanon}
      max={hardMax}
      // staged editing flow
      onDraftChange={onDraftChange}
      onPersistAction={onPersist}
      // we rely on child.commit(), so DELETEs of removed items happen on confirm
      deleteRemovedOnCommit={true}
    />
  );
}

const ProductMediaManager = memo(ProductMediaManagerBase);
ProductMediaManager.displayName = "ProductMediaManager";
export default ProductMediaManager;
