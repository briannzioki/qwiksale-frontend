// src/app/components/media/GalleryUploader.tsx
"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import SmartImage from "@/app/components/SmartImage";

type Props = {
  /** Current gallery (cover is index 0). Absolute URLs or Cloudinary IDs. */
  value: string[];
  /** Called whenever the gallery order/content changes. */
  onChangeAction: (next: string[]) => void | Promise<void>;
  /** When user selects new local files (parent can upload & then merge). */
  onFilesSelectedAction?: (files: File[]) => void | Promise<void>;
  /** Max images allowed (default 10). */
  max?: number;
  className?: string;
  /** Optional label override */
  label?: string;
  /** If true, allow drag–drop reordering (default true). */
  draggable?: boolean;
};

export default function GalleryUploader({
  value,
  onChangeAction,
  onFilesSelectedAction,
  max = 10,
  className = "",
  label = "Photos (up to 10)",
  draggable = true,
}: Props) {
  // Ensure we never render null/undefined entries
  const images = useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean).map(String) : []),
    [value]
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const uid = useId();

  const canAddMore = images.length < max;

  // ----- mutations -----
  const commit = useCallback(
    (next: string[]) => onChangeAction(next.filter(Boolean).map(String).slice(0, max)),
    [onChangeAction, max]
  );

  const removeAt = useCallback(
    (i: number) => {
      if (i < 0 || i >= images.length) return;
      const next = images.filter((_, idx) => idx !== i);
      commit(next);
    },
    [images, commit]
  );

  const move = useCallback(
    (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (i < 0 || i >= images.length) return;
      if (j < 0 || j >= images.length) return;
      const next: string[] = [...images];
      const a: string = next[i]!;
      const b: string = next[j]!;
      next[i] = b;
      next[j] = a;
      commit(next);
    },
    [images, commit]
  );

  const makeCover = useCallback(
    (i: number) => {
      if (i <= 0 || i >= images.length) return;
      const next: string[] = [...images];
      const picked: string = next[i]!;
      next.splice(i, 1);
      next.unshift(picked);
      commit(next);
    },
    [images, commit]
  );

  // ----- drag & drop -----
  const onDragStart = useCallback(
    (i: number) => () => {
      if (!draggable) return;
      setDragIdx(i);
    },
    [draggable]
  );

  const onDragOver = useCallback(
    (i: number) => (e: React.DragEvent) => {
      if (!draggable) return;
      e.preventDefault(); // allow drop
      setDragOverIdx(i);
    },
    [draggable]
  );

  const onDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  const onDrop = useCallback(
    (i: number) => (e: React.DragEvent) => {
      if (!draggable) return;
      e.preventDefault();
      if (dragIdx == null || i === dragIdx) {
        onDragEnd();
        return;
      }
      // reorder
      const next: string[] = [...images];
      const picked: string = next[dragIdx]!;
      next.splice(dragIdx, 1);
      next.splice(i, 0, picked);
      commit(next);
      onDragEnd();
    },
    [draggable, dragIdx, images, commit, onDragEnd]
  );

  // ----- file picking -----
  const pickFiles = useCallback(() => inputRef.current?.click(), []);
  const onFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) {
        e.currentTarget.value = "";
        return;
      }
      // Trim to available space
      const allowed = Math.max(0, max - images.length);
      const chosen = files.slice(0, allowed);
      void onFilesSelectedAction?.(chosen);
      // Clear input so same file selection can fire again later
      e.currentTarget.value = "";
    },
    [images.length, max, onFilesSelectedAction]
  );

  // ----- UI -----
  return (
    <div className={["w-full", className].join(" ")}>
      <label className="text-sm font-medium" htmlFor={`gu-files-${uid}`}>
        {label}
      </label>

      {images.length > 0 && (
        <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((url, i) => {
            const isOver = dragOverIdx === i;
            return (
              <li
                key={`${url}-${i}`}
                className={[
                  "relative rounded-lg border p-2 transition dark:border-gray-800",
                  isOver ? "ring-2 ring-[#39a0ca]" : "",
                ].join(" ")}
                draggable={draggable}
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver(i)}
                onDragEnd={onDragEnd}
                onDrop={onDrop(i)}
                aria-roledescription="Draggable gallery item"
                aria-grabbed={dragIdx === i ? "true" : "false"}
              >
                <div className="relative h-28 w-full overflow-hidden rounded-md bg-slate-100 dark:bg-slate-900">
                  <SmartImage src={url} alt={`Photo ${i + 1}`} fill className="object-cover" />
                </div>

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="truncate">{i === 0 ? "Cover" : `#${i + 1}`}</span>

                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 dark:border-gray-700"
                      onClick={() => move(i, -1)}
                      title="Move left"
                      disabled={i === 0}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 dark:border-gray-700"
                      onClick={() => move(i, +1)}
                      title="Move right"
                      disabled={i === images.length - 1}
                    >
                      →
                    </button>
                    {i !== 0 && (
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5 dark:border-gray-700"
                        onClick={() => makeCover(i)}
                        title="Make cover"
                      >
                        ★
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 dark:border-gray-700"
                      onClick={() => removeAt(i)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={pickFiles}
          className="rounded-xl px-3 py-2 ring-1 ring-gray-300 hover:bg-gray-50 dark:ring-gray-700 dark:hover:bg-gray-900"
          disabled={!canAddMore}
        >
          {canAddMore ? "Choose files" : "Max reached"}
        </button>
        <input
          id={`gu-files-${uid}`}
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={onFiles}
        />
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {images.length}/{max} images
        </div>
      </div>
    </div>
  );
}
