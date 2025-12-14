// src/app/service/[id]/edit/ServiceMediaManager.tsx
"use client";
// src/app/service/[id]/edit/ServiceMediaManager.tsx

import { useCallback, memo, useRef, useState, useEffect } from "react";
import EditMediaClient, {
  type EditMediaClientHandle,
} from "@/app/components/EditMediaClient";
import type { MediaManagerItemIn } from "@/app/components/MediaManager";
import { toast } from "@/app/components/ToasterClient";

export type Img = {
  id: string;
  url: string;
  isCover?: boolean;
  sort?: number;
};

type Props = {
  serviceId: string;
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
  const coverIdx = list.findIndex((x) => x.isCover);
  return JSON.stringify({
    cover: coverIdx >= 0 ? coverIdx : 0,
    urls: list.map((x) => x.url),
  });
}

/* ------------------------------ Component ------------------------------- */

function ServiceMediaManagerBase({ serviceId, initial, max = 6 }: Props) {
  const hardMax = Math.min(Math.max(1, max || 6), 6);

  // canonical at page load (normalized)
  const [initialCanon, setInitialCanon] = useState<MediaManagerItemIn[]>(
    () => normalize(initial || [], hardMax),
  );

  // live draft while editing
  const [, setDraft] = useState<MediaManagerItemIn[]>(initialCanon);

  // change signatures to detect no-op commits
  const [sigInitial, setSigInitial] = useState(() => urlsSignature(initialCanon));
  const [sigDraft, setSigDraft] = useState(() => urlsSignature(initialCanon));

  // keep normalized if props.initial changes
  useEffect(() => {
    const norm = normalize(initial || [], hardMax);
    setInitialCanon(norm);
    setDraft(norm);
    setSigInitial(urlsSignature(norm));
    setSigDraft(urlsSignature(norm));
  }, [initial, hardMax, setDraft]);

  // child ref to call commit()
  const childRef = useRef<EditMediaClientHandle | null>(null);

  /* -------------------------- Draft change wiring ------------------------- */

  const onDraftChange = useCallback(
    (items: MediaManagerItemIn[]) => {
      const sorted = [...items].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id),
      );

      setDraft(sorted);
      setSigDraft(urlsSignature(sorted));

      // page-local draft broadcast for live previews
      try {
        const cover = sorted.find((i) => i.isCover) ?? sorted[0];
        window.dispatchEvent(
          new CustomEvent("qs:gallery:draft", {
            detail: {
              entity: "service",
              entityId: serviceId,
              coverUrl: cover?.url ?? null,
              coverId: cover?.id ?? null,
              orderIds: sorted.map((i) => i.id),
              orderUrls: sorted.map((i) => i.url),
              items: sorted,
            },
          }),
        );
      } catch {
        /* no-op */
      }
    },
    [serviceId, setDraft],
  );

  /* ----------------------------- Commit logic ---------------------------- */

  const commitDraft = useCallback(async () => {
    if (sigDraft === sigInitial) {
      toast.success("Photos are already up to date.");
      return {
        image: initialCanon[0]?.url ?? null,
        gallery: initialCanon.map((x) => x.url),
      };
    }

    try {
      const res = await childRef.current?.commit();
      if (!res) throw new Error("Commit failed.");

      // promote to canonical
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

      // global canonical broadcast
      try {
        window.dispatchEvent(
          new CustomEvent("qs:gallery:canonical", {
            detail: {
              entity: "service",
              id: serviceId,
              image: res.image ?? null,
              gallery: Array.isArray(res.gallery) ? res.gallery : [],
            },
          }),
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
  }, [sigDraft, sigInitial, initialCanon, serviceId, setDraft]);

  // Register global committer and event trigger
  useEffect(() => {
    const key = `service:${serviceId}:media`;
    const w = window as unknown as {
      qsCommitters?: Record<string, () => Promise<unknown>>;
    };
    if (!w.qsCommitters) w.qsCommitters = {};
    w.qsCommitters[key] = commitDraft;

    const handler = (ev: Event) => {
      const d = (ev as CustomEvent).detail || {};
      if (d?.entity === "service" && d?.id === serviceId && d?.scope === "media") {
        void commitDraft();
      }
    };
    window.addEventListener("qs:commit", handler as EventListener);

    return () => {
      if (w.qsCommitters && w.qsCommitters[key]) delete w.qsCommitters[key];
      window.removeEventListener("qs:commit", handler as EventListener);
    };
  }, [serviceId, commitDraft]);

  /* --------------------------- Persist callback --------------------------- */

  // Called by child after successful PATCH; keep it light (revalidate + guarded broadcast)
  const onPersist = useCallback(
    async (p?: { image?: string | null; gallery?: string[] }) => {
      try {
        await fetch(`/api/services/${encodeURIComponent(serviceId)}/revalidate`, {
          method: "POST",
          cache: "no-store",
          credentials: "include",
        }).catch(() => {});
        if (p && ("image" in p || "gallery" in p)) {
          try {
            window.dispatchEvent(
              new CustomEvent("qs:gallery:canonical", {
                detail: {
                  entity: "service",
                  id: serviceId,
                  image: p.image ?? null,
                  gallery: Array.isArray(p.gallery) ? p.gallery : [],
                },
              }),
            );
          } catch {
            /* ignore */
          }
        }
        // avoid duplicate toasts; commitDraft already toasts success
      } catch {
        /* ignore */
      }
    },
    [serviceId],
  );

  /* --------------------------------- Render -------------------------------- */

  return (
    <EditMediaClient
      ref={childRef}
      entity="service"
      entityId={serviceId}
      initial={initialCanon}
      max={hardMax}
      onDraftChange={onDraftChange}
      onPersistAction={onPersist}
      deleteRemovedOnCommit={true}
    />
  );
}

const ServiceMediaManager = memo(ServiceMediaManagerBase);
ServiceMediaManager.displayName = "ServiceMediaManager";
export default ServiceMediaManager;
