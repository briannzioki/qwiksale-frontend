// src/app/components/EditMediaClient.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MediaManager, {
  type MediaManagerChangeItem,
  type MediaManagerItemIn,
} from "@/app/components/MediaManager";

type Img = MediaManagerItemIn;

type Props = {
  entity: "product" | "service";
  entityId: string;
  initial: Img[]; // must have ids because MediaManager requires it
  max?: number;
  /** Optional: observe local changes before persist (normalized and with ids). */
  onChangeAction?: (items: Img[]) => void;
  /** Optional: called after a successful PATCH; good place to revalidate. */
  onPersistAction?: () => void | Promise<void>;
};

type UploadResp =
  | {
      url: string;
      publicId?: string;
      id?: string;
      width?: number;
      height?: number;
      format?: string;
    }
  | { error: string };

const isOkUpload = (
  x: UploadResp
): x is { url: string; publicId?: string; id?: string } =>
  !!(x as any)?.url && !(x as any)?.error;

export default function EditMediaClient({
  entity,
  entityId,
  initial,
  max = 10,
  onChangeAction,
  onPersistAction,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [uploading, setUploading] = useState<number>(0);
  const [uploadTotal, setUploadTotal] = useState<number>(0);

  const apiBase = useMemo(
    () => `/api/${entity}s/${encodeURIComponent(entityId)}/media`,
    [entity, entityId]
  );

  const emit = (name: string, detail: unknown) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {
      /* noop */
    }
  };

  async function uploadOne(file: File): Promise<{ url: string; id?: string }> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", `qwiksale/${entity}s/${entityId}`);

    const r = await fetch("/api/upload", {
      method: "POST",
      body: fd,
      cache: "no-store",
    });

    const j = (await r.json().catch(() => null)) as UploadResp | null;

    if (!r.ok || !j || !isOkUpload(j)) {
      const msg = (j as any)?.error || "Upload failed";
      throw new Error(msg);
    }

    const maybeId = j.publicId ?? j.id;
    return maybeId ? { url: j.url, id: maybeId } : { url: j.url };
  }

  const onChange = useCallback(
    async (next: MediaManagerChangeItem[]) => {
      setError("");
      setSaving(true);
      emit("qs:media:changed", { entity, entityId, items: next });

      try {
        // 1) Upload new files in parallel
        const needUpload = next
          .map((it, i) => ({ i, file: it.file }))
          .filter((x): x is { i: number; file: File } => !!x.file);

        setUploadTotal(needUpload.length);
        setUploading(0);

        const uploaded: Record<number, { url: string; id?: string }> = {};
        await Promise.all(
          needUpload.map(async ({ i, file }) => {
            const res = await uploadOne(file);
            uploaded[i] = res;
            setUploading((n) => n + 1);
          })
        );

        // 2) Build normalized lists:
        //   - itemsForNotify must satisfy Img (id required) for onChangeAction
        //   - itemsForPatch keeps id optional (omit if unknown) for your API
        const itemsForNotify: Img[] = next.map((it, i) => {
          const swap = uploaded[i];
          const url = swap?.url ?? it.url;
          const candidateId = it.id ?? swap?.id ?? url ?? `tmp-${i}-${Date.now()}`;
          return {
            id: String(candidateId),
            url,
            isCover: !!it.isCover,
            sort: typeof it.sort === "number" ? it.sort : i,
          };
        });

        const itemsForPatch = itemsForNotify.map((it, i) => ({
          ...(next[i]?.id || uploaded[i]?.id ? { id: next[i]?.id ?? uploaded[i]?.id } : {}),
          url: it.url,
          isCover: !!it.isCover,
          sort: typeof it.sort === "number" ? it.sort : i,
        }));

        // Allow caller to observe the normalized list (analytics/optimistic)
        onChangeAction?.(itemsForNotify);

        // 3) Persist in one PATCH
        const pr = await fetch(apiBase, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ items: itemsForPatch }),
        });

        if (!pr.ok) {
          const msg =
            (await pr.json().catch(() => null))?.error ||
            "Failed to save media changes.";
          throw new Error(msg);
        }

        emit("qs:media:saved", { entity, entityId, items: itemsForPatch });

        // Let caller revalidate/tag, etc.
        await onPersistAction?.();

        router.refresh();
      } catch (e: any) {
        const msg = e?.message || "Something went wrong while saving photos.";
        setError(msg);
        emit("qs:media:error", { entity, entityId, error: msg });
      } finally {
        setSaving(false);
        setUploadTotal(0);
        setUploading(0);
      }
    },
    [entity, entityId, apiBase, router, onChangeAction, onPersistAction]
  );

  const onRemove = useCallback(
    async (id: string) => {
      setError("");
      emit("qs:media:remove", { entity, entityId, id });
      // Persist via a subsequent onChange with the new list.
    },
    [entity, entityId]
  );

  const onMakeCover = useCallback(
    async (id: string) => {
      setError("");
      emit("qs:media:cover", { entity, entityId, id });
      // Persist via the onChange that follows cover move.
    },
    [entity, entityId]
  );

  const onReorder = useCallback(
    async (idsInOrder: string[]) => {
      setError("");
      emit("qs:media:reorder", { entity, entityId, ids: idsInOrder });
      // Persist via the onChange that follows reorder.
    },
    [entity, entityId]
  );

  const busy = saving || uploadTotal > 0;

  return (
    <div>
      <MediaManager
        initial={initial}
        max={max}
        onChange={onChange}
        onRemove={onRemove}
        onMakeCover={onMakeCover}
        onReorder={onReorder}
      />
      <div className="mt-2 flex items-center gap-2 text-xs">
        {busy && (
          <span className="rounded bg-black/5 px-2 py-1 dark:bg-white/10">
            {uploadTotal > 0
              ? `Uploading ${uploading}/${uploadTotal}…`
              : "Saving…"}
          </span>
        )}
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}
