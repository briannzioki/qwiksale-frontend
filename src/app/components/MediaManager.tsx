"use client";
// src/app/components/MediaManager.tsx

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/app/components/ToasterClient";
import { Icon } from "@/app/components/Icon";

/* ---------------- Types ---------------- */

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

type InternalItem = {
  id?: string | undefined;
  url: string;
  file?: File | undefined;
  isCover?: boolean | undefined;
  sort?: number | undefined;
  _localId: string; // stable identity for DnD/keyboard
  _isNew?: boolean | undefined;
  _objectUrl?: string | undefined; // revoke on cleanup
};

type Props = {
  initial: MediaManagerItemIn[];
  max?: number;
  onChange?(next: MediaManagerChangeItem[]): void;
  onRemove?(id: string): void;
  onMakeCover?(id: string): void;
  onReorder?(idsInOrder: string[]): void;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
};

/* ---------------- Utils ---------------- */

const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `tmp_${Math.random().toString(36).slice(2)}`) as string;

function coerceInitial(list: MediaManagerItemIn[]): InternalItem[] {
  const arr = Array.isArray(list) ? [...list] : [];
  arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id));
  const hasCover = arr.some((x) => x.isCover);
  if (!hasCover && arr.length > 0) arr[0]!.isCover = true;
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

/* ---------------- Component ---------------- */

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
  const [items, setItems] = useState<InternalItem[]>(() =>
    coerceInitial(initial),
  );
  const [selectedIdx, setSelectedIdx] = useState<number>(0); // active preview
  const [, setFocusedIdx] = useState<number>(-1); // kept for keyboard flow; value not read
  const [errorMsg, setErrorMsg] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // DnD state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Dropzone state
  const [dzOver, setDzOver] = useState(false);

  // Thumbnail refs for scrollIntoView
  const thumbRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const replaceItems = useCallback((next: InternalItem[]) => {
    setItems((prev) => {
      for (const it of prev) {
        if (it._objectUrl) URL.revokeObjectURL(it._objectUrl);
      }
      return next;
    });
  }, []);

  // Sync on external initial update
  useEffect(() => {
    const next = coerceInitial(initial);
    replaceItems(next);
    setSelectedIdx((idx) => (idx < next.length ? idx : 0));
  }, [initial, replaceItems]);

  const emitChange = useCallback(
    (next: InternalItem[], announce?: string) => {
      const norm: InternalItem[] = next.map((x, i): InternalItem => ({
        ...x,
        sort: i,
        isCover: i === 0,
      }));
      replaceItems(norm);
      onChange?.(stripInternal(norm));
      setSelectedIdx((i) =>
        Math.max(0, Math.min(i, Math.max(0, norm.length - 1))),
      );
      if (announce) toast.success(announce);
    },
    [onChange, replaceItems],
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
    [accept, maxSizeMB],
  );

  // Handle file input
  const onFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.currentTarget.value = "";
      if (!files.length) return;

      const allowed = Math.max(0, max - items.length);
      if (allowed <= 0) {
        const msg = `You can upload up to ${max} photos.`;
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }
      const chosen = files.slice(0, allowed);
      const { ok, err } = validateFiles(chosen);
      if (err) {
        setErrorMsg(err);
        toast.error(err);
      }
      if (ok.length === 0) return;

      const newItems: InternalItem[] = ok.map((file, i): InternalItem => {
        const objUrl: string = URL.createObjectURL(file);
        return {
          _localId: uid(),
          url: objUrl,
          _objectUrl: objUrl,
          file,
          _isNew: true,
          isCover: false,
          sort: items.length + i,
          id: undefined,
        };
      });
      const next: InternalItem[] = [...items, ...newItems];
      emitChange(next, `Added ${ok.length} photo${ok.length > 1 ? "s" : ""}.`);
      setSelectedIdx(items.length);
      setFocusedIdx(items.length);
    },
    [items, max, validateFiles, emitChange],
  );

  // Remove one
  const removeAt = useCallback(
    (i: number) => {
      if (i < 0 || i >= items.length) return;
      const target = items[i]!;
      if (!confirm("Remove this photo?")) return;

      if (target._objectUrl) URL.revokeObjectURL(target._objectUrl);

      const next: InternalItem[] = items.filter((_, idx) => idx !== i);
      emitChange(next, "Photo removed.");
      setSelectedIdx((sel) =>
        Math.max(0, Math.min(sel - (sel > i ? 1 : 0), next.length - 1)),
      );
      if (target.id) onRemove?.(target.id);
    },
    [items, emitChange, onRemove],
  );

  // Make cover
  const makeCover = useCallback(
    (i: number) => {
      if (i <= 0 || i >= items.length) return;
      const next: InternalItem[] = [...items];
      const picked: InternalItem = next[i]!;
      next.splice(i, 1);
      next.unshift({ ...picked, isCover: true });
      for (let k = 1; k < next.length; k++)
        next[k] = { ...next[k]!, isCover: false };
      emitChange(next, "Cover updated.");
      if (picked.id) onMakeCover?.(picked.id);
      setSelectedIdx(0);
      setFocusedIdx(0);
    },
    [items, emitChange, onMakeCover],
  );

  // Reorder
  const move = useCallback(
    (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (i < 0 || i >= items.length) return;
      if (j < 0 || j >= items.length) return;
      const next: InternalItem[] = [...items];
      const a: InternalItem = next[i]!;
      next.splice(i, 1);
      next.splice(j, 0, a);
      emitChange(next, undefined);
      setSelectedIdx(j);
      setFocusedIdx(j);
      if (onReorder) {
        const ids = next
          .map((x) => x.id)
          .filter((s): s is string => typeof s === "string" && s.length > 0);
        if (ids.length) onReorder(ids);
      }
    },
    [items, emitChange, onReorder],
  );

  // ----- DnD on thumbnails -----
  const onDragStart = useCallback((i: number) => () => setDragIdx(i), []);
  const onDragOver = useCallback(
    (i: number) => (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverIdx(i);
    },
    [],
  );
  const onDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);
  const onDropTile = useCallback(
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
      emitChange(next, undefined);
      if (onReorder) {
        const ids = next
          .map((x) => x.id)
          .filter((s): s is string => typeof s === "string" && s.length > 0);
        if (ids.length) onReorder(ids);
      }
      setSelectedIdx(i);
      setFocusedIdx(i);
      onDragEnd();
    },
    [dragIdx, items, emitChange, onReorder, onDragEnd],
  );

  // Keyboard on preview
  const onPreviewKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!items.length) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(items.length - 1, i + 1));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeAt(selectedIdx);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        makeCover(selectedIdx);
        return;
      }
    },
    [items.length, selectedIdx, removeAt, makeCover],
  );

  // Cleanup local object URLs
  useEffect(() => {
    return () => {
      for (const it of items) {
        if (it._objectUrl) URL.revokeObjectURL(it._objectUrl);
      }
    };
  }, [items]);

  // External dropzone
  const onDzDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDzOver(true);
  }, []);
  const onDzDragLeave = useCallback(() => setDzOver(false), []);
  const onDzDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDzOver(false);
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;

      const allowed = Math.max(0, max - items.length);
      if (allowed <= 0) {
        const msg = `You can upload up to ${max} photos.`;
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }
      const chosen = files.slice(0, allowed);
      const { ok, err } = validateFiles(chosen);
      if (err) {
        setErrorMsg(err);
        toast.error(err);
      }
      if (ok.length === 0) return;

      const newItems: InternalItem[] = ok.map((file, i): InternalItem => {
        const objUrl: string = URL.createObjectURL(file);
        return {
          _localId: uid(),
          url: objUrl,
          _objectUrl: objUrl,
          file,
          _isNew: true,
          isCover: false,
          sort: items.length + i,
          id: undefined,
        };
      });
      const next: InternalItem[] = [...items, ...newItems];
      emitChange(next, `Added ${ok.length} photo${ok.length > 1 ? "s" : ""}.`);
      setSelectedIdx(items.length);
      setFocusedIdx(items.length);
    },
    [items, max, validateFiles, emitChange],
  );

  // Auto-scroll active thumb into view
  useEffect(() => {
    const key = items[selectedIdx]?._localId;
    if (!key) return;
    const node = thumbRefs.current[key];
    node?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedIdx, items]);

  /* ---------------- Render ---------------- */

  return (
    <div
      className={["w-full", className].join(" ")}
      onDragOver={onDzDragOver}
      onDragLeave={onDzDragLeave}
      onDrop={onDzDrop}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text)]">
          Media
        </h3>
        <div className="text-[11px] sm:text-xs text-[var(--text-muted)]">
          {items.length}/{max}
        </div>
      </div>

      {/* Empty state = full dropzone */}
      {items.length === 0 ? (
        <div
          className={[
            "mt-2.5 rounded-2xl border-2 border-dashed p-5 sm:p-8 text-center transition",
            "text-xs sm:text-sm",
            "bg-[var(--bg-elevated)] shadow-sm",
            dzOver
              ? "border-[var(--border)] ring-2 ring-focus"
              : "border-[var(--border-subtle)]",
          ].join(" ")}
          aria-label="Drop photos here or use the Add photos button"
        >
          <div className="mx-auto mb-2.5 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
            <Icon name="upload" className="text-[var(--text-muted)]" />
          </div>
          <p className="font-semibold text-[var(--text)]">
            Drag & drop photos here
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-[var(--text-muted)]">
            PNG/JPG up to {maxSizeMB}MB each. First photo becomes the cover.
          </p>
          <div className="mt-3 sm:mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={pickFiles}
              className={[
                "h-9 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs sm:text-sm font-semibold",
                "text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)]",
                "active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              ].join(" ")}
              disabled={!canAddMore}
            >
              Add photos
            </button>
            <button
              type="button"
              className={[
                "h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs sm:text-sm",
                "text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)]",
                "active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus",
              ].join(" ")}
              onClick={() => toast("Tip: You can also paste images from clipboard")}
            >
              Tips
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ====== Big Preview ====== */}
          <div
            className={[
              "mt-2.5 overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] shadow-sm",
              "border-[var(--border-subtle)]",
              dzOver ? "ring-2 ring-focus" : "",
            ].join(" ")}
          >
            <div
              className="mm-preview relative outline-none"
              tabIndex={0}
              onKeyDown={onPreviewKeyDown}
              aria-label="Selected photo preview"
            >
              {/* Badge(s) */}
              {selectedIdx === 0 && (
                <span
                  className={[
                    "absolute left-2 top-2 z-20 rounded-xl border px-2 py-1 text-[11px] sm:text-xs font-semibold shadow-sm",
                    "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
                  ].join(" ")}
                >
                  Cover
                </span>
              )}
              {items[selectedIdx]?._isNew && (
                <span
                  className={[
                    "absolute left-2 top-9 z-20 rounded-xl border px-2 py-1 text-[11px] sm:text-xs font-semibold shadow-sm",
                    "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
                  ].join(" ")}
                >
                  New
                </span>
              )}

              {/* Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={items[selectedIdx]!.url}
                alt=""
                className="h-full w-full bg-[var(--bg)] object-contain"
              />

              {/* Prev / Next controls */}
              <button
                type="button"
                onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
                disabled={selectedIdx === 0}
                className="btn-outline absolute left-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs"
                aria-label="Previous photo"
                title="Previous"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedIdx((i) => Math.min(items.length - 1, i + 1))
                }
                disabled={selectedIdx === items.length - 1}
                className="btn-outline absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs"
                aria-label="Next photo"
                title="Next"
              >
                ›
              </button>

              {/* Top-right actions */}
              <div className="absolute right-2 top-2 z-20 flex gap-1.5">
                {selectedIdx !== 0 && (
                  <button
                    type="button"
                    className="btn-outline px-2 py-1 text-xs"
                    onClick={() => makeCover(selectedIdx)}
                    title="Make cover"
                  >
                    Make cover
                  </button>
                )}
                <button
                  type="button"
                  className={[
                    "rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs font-semibold",
                    "text-[var(--danger)] shadow-sm transition hover:bg-[var(--bg-subtle)]",
                    "active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  ].join(" ")}
                  onClick={() => removeAt(selectedIdx)}
                  title="Remove photo"
                >
                  Remove
                </button>
              </div>

              {/* Uploading hint */}
              {items[selectedIdx]?.file && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden bg-[var(--bg-subtle)]"
                  role="progressbar"
                  aria-label="Uploading"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext="Uploading"
                >
                  <div className="h-full w-1/2 animate-[progress_1.2s_linear_infinite] bg-[var(--text)] opacity-25" />
                </div>
              )}
            </div>

            {/* ====== Thumbnails strip ====== */}
            <div className="border-t border-[var(--border-subtle)]">
              <ul
                className="no-scrollbar flex gap-1.5 overflow-x-auto p-1.5 sm:gap-2 sm:p-2"
                aria-label="Photo thumbnails"
                onWheel={(e: React.WheelEvent<HTMLUListElement>) => {
                  const el = e.currentTarget;
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    el.scrollLeft += e.deltaY;
                  }
                }}
              >
                {items.map((it, i) => {
                  const isActive = i === selectedIdx;
                  const isOver = dragOverIdx === i;
                  const key = it._localId;

                  return (
                    <li key={key} className="relative">
                      <button
                        ref={(el) => {
                          thumbRefs.current[key] = el;
                        }}
                        type="button"
                        aria-label={`Select photo ${i + 1}`}
                        aria-current={isActive}
                        onClick={() => {
                          setSelectedIdx(i);
                          setFocusedIdx(i);
                        }}
                        draggable
                        onDragStart={onDragStart(i)}
                        onDragOver={onDragOver(i)}
                        onDragEnd={onDragEnd}
                        onDrop={onDropTile(i)}
                        className={[
                          "block cursor-pointer overflow-hidden rounded-xl border bg-[var(--bg-elevated)] shadow-sm",
                          "h-14 w-20 min-[420px]:h-16 min-[420px]:w-24",
                          isActive
                            ? "border-[var(--border)] ring-2 ring-focus"
                            : "border-[var(--border-subtle)] hover:border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                          isOver ? "ring-2 ring-focus" : "",
                          "transition",
                          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                        ].join(" ")}
                        title={i === 0 ? "Cover" : `Photo #${i + 1}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>

                      {/* tiny badge for cover */}
                      {i === 0 && (
                        <span className="absolute left-1 top-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text)] shadow-sm">
                          Cover
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Tips row (scroll on xs so it doesn't eat vertical space) */}
          <div className="no-scrollbar mt-1.5 flex items-center gap-2 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] text-[11px] sm:text-xs text-[var(--text-muted)]">
            <Icon name="info" aria-hidden />
            ← / → to switch • Enter/Home = make cover • ⌫ = remove • Drag thumbnails
            to reorder
          </div>
        </>
      )}

      {/* Actions row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={pickFiles}
          className={[
            "h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs sm:text-sm",
            "text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] hover:border-[var(--border)]",
            "active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus",
          ].join(" ")}
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

        {errorMsg && (
          <span className="text-[11px] sm:text-xs text-[var(--danger)]">
            {errorMsg}
          </span>
        )}

        <span className="w-full sm:w-auto sm:ml-auto text-[11px] sm:text-xs text-[var(--text-muted)]">
          PNG/JPG • up to {maxSizeMB}MB • max {max} photos
        </span>
      </div>

      {/* Progress keyframes + hide scrollbar (scoped) */}
      <style jsx>{`
        @keyframes progress {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }
        .mm-preview {
          aspect-ratio: 16 / 11; /* shorter on small phones */
        }
        @media (min-width: 420px) {
          .mm-preview {
            aspect-ratio: 4 / 3; /* restore on bigger phones */
          }
        }
        @media (min-width: 640px) {
          .mm-preview {
            aspect-ratio: 16 / 10; /* desktop/tablet */
          }
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
