// src/app/components/MediaManager.tsx
"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type MediaManagerItemIn = {
  id: string;
  url: string;
  isCover?: boolean | undefined;
  sort?: number | undefined;
};

export type MediaManagerChangeItem = {
  id?: string | undefined;
  url: string;
  file?: File | undefined;
  isCover?: boolean | undefined;
  sort?: number | undefined;
};

type Props = {
  initial: MediaManagerItemIn[];
  max?: number;
  onChange?(next: MediaManagerChangeItem[]): void;
  onRemove?(id: string): void;
  onMakeCover?(id: string): void;
  onReorder?(idsInOrder: string[]): void;
  /** Optional accept string for file input (default: image/*) */
  accept?: string;
  /** Optional max file size (MB) for new uploads (default: 10) */
  maxSizeMB?: number;
  className?: string;
};

type InternalItem = MediaManagerChangeItem & {
  /** Guaranteed local identity for DnD/keyboard, stable across renders */
  _localId: string;
  /** Distinguish newly-added local items (no server id yet) */
  _isNew?: boolean | undefined;
  /** If we created an object URL for preview, keep it to revoke later */
  _objectUrl?: string | undefined;
};

const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `tmp_${Math.random().toString(36).slice(2)}`) as string;

function coerceInitial(list: MediaManagerItemIn[]): InternalItem[] {
  const arr = Array.isArray(list) ? [...list] : [];
  // sort by provided sort (asc), then by id for stability
  arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id));
  // ensure at least one cover
  const foundCover = arr.findIndex((x) => x.isCover) !== -1;
  if (!foundCover && arr.length > 0) arr[0]!.isCover = true;
  // map to internal
  return arr.map((x, i): InternalItem => ({
    id: x.id,
    url: x.url,
    isCover: Boolean(x.isCover) || i === 0,
    sort: typeof x.sort === "number" ? x.sort : i,
    _localId: x.id || uid(),
  }));
}

function stripInternal(xs: InternalItem[]): MediaManagerChangeItem[] {
  return xs.map((x, i): MediaManagerChangeItem => {
    const out: MediaManagerChangeItem = {
      url: x.url,
      sort: typeof x.sort === "number" ? x.sort : i,
    };
    if (x.id) out.id = x.id;
    if (x.file) out.file = x.file;
    if (x.isCover) out.isCover = true;
    return out;
  });
}

export default function MediaManager({
  initial,
  max = 10,
  onChange,
  onRemove,
  onMakeCover,
  onReorder,
  accept = "image/*",
  maxSizeMB = 10,
  className = "",
}: Props) {
  const [items, setItems] = useState<InternalItem[]>(() => coerceInitial(initial));
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Revoke any object URLs when a batch of items is replaced
  const replaceItems = useCallback((next: InternalItem[]) => {
    setItems((prev) => {
      for (const it of prev) {
        if (it._objectUrl) {
          URL.revokeObjectURL(it._objectUrl);
        }
      }
      return next;
    });
  }, []);

  // Sync when initial changes (e.g., after save)
  useEffect(() => {
    replaceItems(coerceInitial(initial));
  }, [initial, replaceItems]);

  // Helpers
  const emitChange = useCallback(
    (next: InternalItem[]) => {
      // normalize sort to current order (keep type exact)
      const norm: InternalItem[] = next.map(
        (x, i): InternalItem => ({ ...x, sort: i, isCover: i === 0 })
      );
      replaceItems(norm);
      if (onChange) onChange(stripInternal(norm));
    },
    [onChange, replaceItems]
  );

  const canAddMore = items.length < max;

  const pickFiles = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const validateFiles = useCallback(
    (files: File[]): { ok: File[]; err: string } => {
      if (!files.length) return { ok: [], err: "" };
      const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
      const maxBytes = maxSizeMB * 1024 * 1024;
      const problems: string[] = [];
      const ok: File[] = [];
      for (const f of files) {
        if (accept.includes("image/") && !f.type.startsWith("image/")) {
          problems.push(`"${f.name}" is not an image.`);
          continue;
        }
        if (f.size > maxBytes) {
          problems.push(`"${f.name}" is ${mb(f.size)}MB (max ${maxSizeMB}MB).`);
          continue;
        }
        ok.push(f);
      }
      return { ok, err: problems.join(" ") };
    },
    [accept, maxSizeMB]
  );

  // NOTE: keep this handler synchronous so we can safely reset the input value immediately.
  const onFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      // Reset synchronously to avoid the "e.currentTarget is null" class of issues.
      e.currentTarget.value = ""; // allow re-selecting same file later
      if (!files.length) return;

      const allowed = Math.max(0, max - items.length);
      if (allowed <= 0) {
        setErrorMsg(`You can upload up to ${max} photos.`);
        return;
      }
      const chosen = files.slice(0, allowed);
      const { ok, err } = validateFiles(chosen);
      setErrorMsg(err);

      if (ok.length === 0) return;

      // Create preview items; the actual upload can be handled by the parent
      // when it sees file objects in onChange()
      const newItems: InternalItem[] = ok.map((file, i): InternalItem => {
        const objUrl = URL.createObjectURL(file);
        return {
          _localId: uid(),
          url: objUrl,
          _objectUrl: objUrl,
          file,
          isCover: false,
          sort: items.length + i,
          // id intentionally omitted (not yet persisted)
        };
      });
      const next: InternalItem[] = [...items, ...newItems];
      emitChange(next);
      // Focus the first newly added
      setFocusedIdx(items.length);
    },
    [items, max, validateFiles, emitChange]
  );

  const removeAt = useCallback(
    (i: number) => {
      if (i < 0 || i >= items.length) return;
      const target = items[i]!;
      const id = target.id;
      if (!confirm("Remove this photo?")) return;

      if (target._objectUrl) URL.revokeObjectURL(target._objectUrl);

      const next: InternalItem[] = items.filter((_, idx) => idx !== i);
      emitChange(next);
      if (id && onRemove) onRemove(id);
    },
    [items, emitChange, onRemove]
  );

  const makeCover = useCallback(
    (i: number) => {
      if (i <= 0 || i >= items.length) return;
      const next: InternalItem[] = [...items];
      const picked: InternalItem = next[i]!;
      next.splice(i, 1);
      next.unshift({ ...picked, isCover: true });
      // reset others' isCover to false; emitChange will enforce first item as cover anyway
      for (let k = 1; k < next.length; k++) next[k] = { ...next[k]!, isCover: false };
      emitChange(next);
      if (picked.id && onMakeCover) onMakeCover(picked.id);
      setFocusedIdx(0);
    },
    [items, emitChange, onMakeCover]
  );

  const move = useCallback(
    (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (i < 0 || i >= items.length) return;
      if (j < 0 || j >= items.length) return;
      const next: InternalItem[] = [...items];
      const a: InternalItem = next[i]!;
      next.splice(i, 1);
      next.splice(j, 0, a);
      emitChange(next);
      setFocusedIdx(j);
      // notify IDs in order (only those that have real ids)
      if (onReorder) {
        const ids = next
          .map((x) => x.id)
          .filter((s): s is string => typeof s === "string" && s.length > 0);
        if (ids.length) onReorder(ids);
      }
    },
    [items, emitChange, onReorder]
  );

  // ----- Drag & Drop -----
  const onDragStart = useCallback((i: number) => () => setDragIdx(i), []);
  const onDragOver = useCallback(
    (i: number) => (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverIdx(i);
    },
    []
  );
  const onDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);
  const onDrop = useCallback(
    (i: number) => (e: React.DragEvent) => {
      e.preventDefault();
      if (dragIdx == null || i === dragIdx) {
        onDragEnd();
        return;
      }
      const next: InternalItem[] = [...items];
      const picked: InternalItem = next[dragIdx]!;
      next.splice(dragIdx, 1);
      next.splice(i, 0, picked);
      emitChange(next);
      if (onReorder) {
        const ids = next
          .map((x) => x.id)
          .filter((s): s is string => typeof s === "string" && s.length > 0);
        if (ids.length) onReorder(ids);
      }
      setFocusedIdx(i);
      onDragEnd();
    },
    [dragIdx, items, emitChange, onReorder, onDragEnd]
  );

  // ----- Keyboard controls on a tile -----
  const onKey = useCallback(
    (i: number) => (e: React.KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeAt(i);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        makeCover(i);
        return;
      }
      // Ctrl/Cmd/Alt + arrow = reorder
      const mod = e.altKey || e.ctrlKey || e.metaKey;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (mod) move(i, -1);
        else setFocusedIdx(Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (mod) move(i, +1);
        else setFocusedIdx(Math.min(items.length - 1, i + 1));
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        makeCover(i);
        return;
      }
    },
    [items.length, removeAt, makeCover, move]
  );

  const coverIdx = useMemo(() => items.findIndex((x) => x.isCover), [items]);

  // Cleanup all object URLs on unmount
  useEffect(() => {
    return () => {
      for (const it of items) {
        if (it._objectUrl) URL.revokeObjectURL(it._objectUrl);
      }
    };
  }, [items]);

  return (
    <div className={["w-full", className].join(" ")}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Media</h3>
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {items.length}/{max}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-gray-600 dark:border-slate-700 dark:text-slate-300">
          No photos yet.
          <div className="mt-3">
            <button
              type="button"
              onClick={pickFiles}
              className="rounded-lg bg-[#161748] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
              disabled={!canAddMore}
            >
              Add photos
            </button>
          </div>
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((it, i) => {
            const isOver = dragOverIdx === i;
            const isFocused = focusedIdx === i;
            return (
              <li
                key={it._localId}
                tabIndex={0}
                onFocus={() => setFocusedIdx(i)}
                onKeyDown={onKey(i)}
                draggable
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver(i)}
                onDragEnd={onDragEnd}
                onDrop={onDrop(i)}
                className={[
                  "group relative overflow-hidden rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-950 outline-none transition",
                  isOver ? "ring-2 ring-[#39a0ca]" : "",
                  isFocused ? "ring-2 ring-[#39a0ca]" : "",
                ].join(" ")}
                aria-roledescription="Draggable media item"
                aria-grabbed={dragIdx === i ? "true" : "false"}
              >
                {/* Use plain <img> to avoid next/image config issues */}
                <img src={it.url} alt="" className="h-40 w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-2 text-xs text-white">
                  <span className="font-medium truncate">
                    {i === coverIdx ? "Cover photo" : `Photo #${i + 1}`}
                  </span>
                  <span className="opacity-80">{it.id ? "Saved" : "New"}</span>
                </div>
                <div className="absolute top-2 right-2 hidden gap-2 group-hover:flex">
                  {i !== 0 && (
                    <button
                      type="button"
                      className="rounded-md bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/75"
                      onClick={() => makeCover(i)}
                      title="Make cover"
                    >
                      Make cover
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-md bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/75"
                    onClick={() => removeAt(i)}
                    title="Remove"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={pickFiles}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-black/5 dark:border-slate-700 dark:hover:bg-white/10"
          disabled={!canAddMore}
        >
          {canAddMore ? "Add more" : "Max reached"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={onFiles}
        />
        {errorMsg && <span className="text-xs text-red-600">{errorMsg}</span>}
        <span className="ml-auto text-xs text-gray-500">
          Tips: Enter = cover, ⌫ = remove, Alt/Ctrl + ←/→ = reorder
        </span>
      </div>
    </div>
  );
}
