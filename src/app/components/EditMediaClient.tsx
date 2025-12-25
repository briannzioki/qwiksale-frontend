"use client";
// src/app/components/EditMediaClient.tsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import MediaManager, {
  type MediaManagerChangeItem,
  type MediaManagerItemIn,
} from "@/app/components/MediaManager";
import { apiAddImage, apiDeleteImage } from "@/app/lib/media";

/* --------------------------------- Types -------------------------------- */

export type Img = MediaManagerItemIn;

type Entity = "product" | "service";
type KindPlural = "products" | "services";

export type CommitResult = { image: string | null; gallery: string[] };

export type EditMediaClientHandle = {
  /** Persist the current draft to the server (PATCH /media + optional DELETEs). */
  commit: () => Promise<CommitResult>;
};

type Props = {
  entity: Entity;
  entityId: string;
  /** Initial canonical media (normalized by parent). */
  initial: Img[];
  /** Max gallery items (UI cap). */
  max?: number;

  /**
   * (Legacy) Notified on any local change (pre-persist).
   * Kept for compatibility with existing parents.
   */
  onChangeAction?: (items: Img[]) => void;

  /**
   * Called after a successful commit with canonical server truth.
   * Parent can revalidate or broadcast canonical state from here.
   */
  onPersistAction?: (
    p?: { image?: string | null; gallery?: string[] },
  ) => void | Promise<void>;

  /**
   * New: staged edits callback. Fires with the normalized draft whenever it changes.
   * Use this to enable/disable "Update" buttons, show dirty state, etc.
   */
  onDraftChange?: (items: Img[]) => void;

  /**
   * New: whether commit() should also DELETE removed URLs from storage.
   * Defaults to true.
   */
  deleteRemovedOnCommit?: boolean;

  /**
   * New: optional registrar that receives the bound commit() fn.
   * Useful if you prefer a callback over refs.
   */
  onRegisterCommit?: (commit: EditMediaClientHandle["commit"]) => void;
};

/* ------------------------------- Component ------------------------------- */

const EditMediaClient = forwardRef<EditMediaClientHandle, Props>(
  function EditMediaClient(
    {
      entity,
      entityId,
      initial,
      max = 10,
      onChangeAction,
      onPersistAction,
      onDraftChange,
      deleteRemovedOnCommit = true,
      onRegisterCommit,
    },
    ref,
  ) {
    // Derive helper values
    const kindPlural: KindPlural = entity === "product" ? "products" : "services";

    // Endpoints
    const apiMediaList = useMemo(
      () => `/api/${kindPlural}/${encodeURIComponent(entityId)}/media`,
      [kindPlural, entityId],
    );
    const apiMediaFile = useMemo(
      () => `/api/${kindPlural}/${encodeURIComponent(entityId)}/image`,
      [kindPlural, entityId],
    );

    // UI state
    const [error, setError] = useState<string>("");
    const [uploading, setUploading] = useState<number>(0);
    const [uploadTotal, setUploadTotal] = useState<number>(0);
    const busy = uploadTotal > 0;

    // Draft vs committed/canonical
    const [draft, setDraft] = useState<Img[]>(initial);
    const committedRef = useRef<Img[]>(initial); // last successfully committed canonical
    useEffect(() => {
      setDraft(initial);
      committedRef.current = initial;
    }, [initial]);

    // Guards
    const mounted = useRef(true);
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    // Small helpers
    const emit = (name: string, detail: unknown) => {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      } catch {
        /* no-op */
      }
    };
    const isHttp = (s: string) => /^https?:\/\//i.test(s);

    /* ---------------------------- Normalization ---------------------------- */

    function normalizeList(items: Img[]): Img[] {
      // Enforce sort, ensure ids, keep http(s), dedupe by URL, single cover at index 0
      const prepared = items
        .map((x, i) => ({
          id: String(x?.id ?? x?.url ?? `tmp-${i}-${Date.now()}`),
          url: String(x?.url ?? "").trim(),
          isCover: !!x?.isCover,
          sort: Number.isFinite(x?.sort) ? Number(x!.sort) : i,
          i,
        }))
        .filter((x) => isHttp(x.url));

      prepared.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.i - b.i);

      const seen = new Set<string>();
      const unique: Img[] = [];
      for (const it of prepared) {
        if (seen.has(it.url)) continue;
        seen.add(it.url);
        unique.push({ id: it.id, url: it.url, isCover: it.isCover, sort: it.sort });
      }

      // Ensure a single cover at 0 (explicit wins)
      const explicitIdx = unique.findIndex((u) => u.isCover);
      if (explicitIdx > 0) {
        const removed = unique.splice(explicitIdx, 1);
        const cov = removed[0];
        if (cov) {
          // cov is guaranteed to have id/url (Img), keep TS happy and fields non-optional
          unique.unshift({ id: cov.id, url: cov.url, isCover: true, sort: 0 });
        }
      } else if (explicitIdx < 0 && unique[0]) {
        unique[0] = {
          id: unique[0].id,
          url: unique[0].url,
          isCover: true,
          sort: 0,
        };
      }

      // Cap
      return unique.slice(0, Math.max(1, Math.min(50, max)));
    }

    /* ----------------------------- File uploads ---------------------------- */

    async function uploadOne(file: File): Promise<{ url: string; id?: string }> {
      // Uses apiAddImage -> /api/{kind}/{id}/image; returns url + optional publicId
      const res = await apiAddImage(kindPlural, entityId, file);
      const id =
        typeof res.publicId === "string" && res.publicId ? res.publicId : undefined;
      const url = (res.url && res.url.length ? res.url : res.image) || "";
      if (!url) throw new Error("Upload failed (no URL)");
      return id ? { url, id } : { url };
    }

    /* --------------------------- Draft mutations --------------------------- */

    const applyDraft = useCallback(
      (nextItems: MediaManagerChangeItem[]) => {
        // Convert MediaManagerChangeItem -> Img (preserve provided ids where possible)
        const mapped: Img[] = nextItems.map((it, i) => ({
          id: String(it?.id ?? it?.url ?? `tmp-${i}-${Date.now()}`),
          url: String(it?.url ?? ""),
          isCover: !!it?.isCover,
          sort: Number.isFinite(it?.sort) ? Number(it!.sort) : i,
        }));

        const normalized = normalizeList(mapped);

        setDraft(normalized);
        onChangeAction?.(normalized);
        onDraftChange?.(normalized);

        // Fire a "draft" event for in-page previews
        const cover = normalized.find((x) => x.isCover) ?? normalized[0];
        emit("qs:gallery:draft", {
          entity,
          entityId,
          coverUrl: cover?.url ?? null,
          coverId: cover?.id ?? null,
          orderIds: normalized.map((i) => i.id),
          orderUrls: normalized.map((i) => i.url),
          items: normalized,
        });
      },
      [entity, entityId, onChangeAction, onDraftChange],
    );

    const onChange = useCallback(
      async (items: MediaManagerChangeItem[]) => {
        setError("");
        emit("qs:media:changed", { entity, entityId, items });

        // Upload any new local files (to get real https URLs for preview),
        // but DO NOT persist gallery order/cover to the product/service yet.
        const needUpload = items
          .map((it, idx) => ({ idx, file: it.file }))
          .filter((r): r is { idx: number; file: File } => !!r.file);

        setUploadTotal(needUpload.length);
        setUploading(0);

        const uploaded: Record<number, { url: string; id?: string }> = {};
        await Promise.all(
          needUpload.map(async ({ idx, file }) => {
            const res = await uploadOne(file);
            uploaded[idx] = res;
            if (mounted.current) setUploading((n) => n + 1);
          }),
        );

        // Replace local file entries with their uploaded URLs/ids in the draft
        const merged = items.map((it, i) => {
          const swap = uploaded[i];
          if (!swap) return it;
          return {
            ...it,
            id: String(it?.id ?? swap.id ?? swap.url ?? `tmp-${i}-${Date.now()}`),
            url: swap.url,
            file: undefined, // no longer needed
          };
        });

        applyDraft(merged);

        if (mounted.current) {
          setUploadTotal(0);
          setUploading(0);
        }
      },
      [entity, entityId, applyDraft],
    );

    // Do NOT delete on server immediately; just let MediaManager emit the next onChange
    const onRemove = useCallback(
      async (idOrUrl: string) => {
        setError("");
        emit("qs:media:remove", { entity, entityId, id: idOrUrl });
        // Nothing else here - actual draft array will arrive via the subsequent onChange.
      },
      [entity, entityId],
    );

    const onMakeCover = useCallback(
      async (id: string) => {
        setError("");
        emit("qs:media:cover", { entity, entityId, id });
        // Draft state will update via onChange from MediaManager.
      },
      [entity, entityId],
    );

    const onReorder = useCallback(
      async (idsInOrder: string[]) => {
        setError("");
        emit("qs:media:reorder", { entity, entityId, ids: idsInOrder });
        // Draft state will update via onChange from MediaManager.
      },
      [entity, entityId],
    );

    /* -------------------------------- Commit -------------------------------- */

    const commit = useCallback<EditMediaClientHandle["commit"]>(async () => {
      // Prepare payload from the current draft
      const prepared = normalizeList(draft);
      const body = {
        items: prepared.map((x) => ({
          url: x.url,
          isCover: !!x.isCover,
          sort: x.sort ?? 0,
        })),
      };

      // Persist once via PATCH /media
      const pr = await fetch(apiMediaList, {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify(body),
      });

      if (!pr.ok) {
        let msg = `Failed to save photos (${pr.status})`;
        try {
          const j = await pr.json();
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      // Read canonical server truth
      let payload:
        | { ok?: boolean; cover?: string | null; image?: string | null; gallery?: string[] }
        | null = null;
      try {
        payload = await pr.json();
      } catch {
        payload = null;
      }

      const gallery = Array.isArray(payload?.gallery) ? payload!.gallery : [];
      const image = (payload?.cover ?? payload?.image ?? null) as string | null;

      // Optionally clean up removed assets (compare committed -> new draft)
      if (deleteRemovedOnCommit) {
        const prevUrls = new Set<string>(normalizeList(committedRef.current).map((x) => x.url));
        const nextUrls = new Set<string>(prepared.map((x) => x.url));
        const removed: string[] = [];
        for (const u of prevUrls) if (!nextUrls.has(u)) removed.push(u);

        if (removed.length > 0) {
          await Promise.allSettled(removed.map((u) => apiDeleteImage(kindPlural, entityId, u)));
        }
      }

      // Update committed state & emit canonical event upstream
      committedRef.current = prepared;
      emit("qs:media:saved", { entity, entityId, items: gallery });

      if (payload && (payload.image !== undefined || payload.cover !== undefined || payload.gallery)) {
        await onPersistAction?.({ image, gallery });
      }

      // Mirror canonical into draft for a clean state
      const canonicalDraft: Img[] = gallery.map((u, i) => ({
        id: u,
        url: u,
        isCover: i === 0,
        sort: i,
      }));
      setDraft(canonicalDraft);

      return { image, gallery };
    }, [
      draft,
      apiMediaList,
      deleteRemovedOnCommit,
      entity,
      entityId,
      kindPlural,
      onPersistAction,
    ]);

    // Expose commit via ref and optional registrar
    useImperativeHandle(ref, () => ({ commit }), [commit]);
    useEffect(() => {
      if (onRegisterCommit) onRegisterCommit(commit);
    }, [commit, onRegisterCommit]);

    /* --------------------------------- Render -------------------------------- */

    return (
      <div>
        <MediaManager
          initial={draft}
          max={max}
          onChange={onChange}
          onRemove={onRemove}
          onMakeCover={onMakeCover}
          onReorder={onReorder}
        />

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)] sm:gap-2">
          {busy && (
            <span className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-medium sm:px-2.5">
              {`Uploading ${uploading}/${uploadTotal}…`}
            </span>
          )}

          {error && (
            <span className="inline-flex items-center rounded-xl border border-[color:var(--danger-soft)] bg-[color:var(--danger-soft)] px-2 py-1 text-[11px] font-medium text-[color:var(--danger)] sm:px-2.5">
              {error}
            </span>
          )}
        </div>
      </div>
    );
  },
);

export default EditMediaClient;
