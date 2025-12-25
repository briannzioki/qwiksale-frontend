"use client";
// src/app/components/media/GalleryUploader.tsx

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import SmartImage from "@/app/components/SmartImage";
import IconButton from "@/app/components/IconButton";

type Props = {
  /** Current gallery (cover is index 0). Absolute URLs or Cloudinary IDs. */
  value: string[];
  /** Called whenever the gallery order/content changes. */
  onChangeAction: (next: string[]) => void | Promise<void>;
  /** When user selects new local files (parent can upload & then merge). */
  onFilesSelectedAction?: (files: File[]) => void | Promise<void>;
  /** Max images allowed (hard-capped to 6). */
  max?: number;
  className?: string;
  /** Optional label override (default reflects cap). */
  label?: string;
  /** If true, allow drag-drop reordering (default true). */
  draggable?: boolean;

  /** Accept string for file input (default: "image/*"; supports ".jpg,.png", etc.) */
  accept?: string;
  /** Max size per file in MB (default: 10) */
  maxSizeMB?: number;
};

function splitAccept(accept: string): string[] {
  return accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function isAcceptedByToken(file: File, token: string): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (token.startsWith(".")) return name.endsWith(token); // extension like ".jpg"
  if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1)); // wildcard "image/*"
  return type === token; // exact MIME
}

function isAccepted(file: File, accept: string): boolean {
  if (!accept || !accept.trim()) return true;
  const tokens = splitAccept(accept);
  if (tokens.length === 0) return true;
  return tokens.some((t) => isAcceptedByToken(file, t));
}

/** Dedup key for freshly picked files (best-effort, not cryptographic). */
function fileSig(f: File) {
  return `${(f.name || "").toLowerCase()}|${f.type}|${f.size}`;
}

export default function GalleryUploader({
  value,
  onChangeAction,
  onFilesSelectedAction,
  max = 6,
  className = "",
  label,
  draggable = true,
  accept = "image/*",
  maxSizeMB = 10,
}: Props) {
  // Hard cap at 6 regardless of prop (keeps product galleries consistent)
  const CAP = Math.min(max ?? 6, 6);

  // Ensure we never render null/undefined entries & dedupe by URL
  const images = useMemo(() => {
    const arr = Array.isArray(value) ? value.filter(Boolean).map(String) : [];
    const seen = new Set<string>();
    return arr.filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });
  }, [value]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [liveMsg, setLiveMsg] = useState<string>("");
  const [dropping, setDropping] = useState(false);
  const pickedSigs = useRef<Set<string>>(new Set());
  const uid = useId();

  const canAddMore = images.length < CAP;
  const labelText = label ?? `Photos (up to ${CAP})`;

  // ----- SR announce -----
  const announce = useCallback((msg: string) => {
    setLiveMsg(msg);
    setTimeout(() => setLiveMsg(""), 1200);
  }, []);

  // ----- commit (normalizes & respects cap) -----
  const commit = useCallback(
    async (next: string[]) => {
      const cleaned = next.filter(Boolean).map(String);
      const capped = cleaned.slice(0, CAP);
      await onChangeAction(capped);
    },
    [onChangeAction, CAP],
  );

  const removeAt = useCallback(
    (i: number) => {
      if (i < 0 || i >= images.length) return;
      const next = images.filter((_, idx) => idx !== i);
      void commit(next);
      announce(`Removed photo ${i + 1}`);
    },
    [images, commit, announce],
  );

  const move = useCallback(
    (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (i < 0 || i >= images.length) return;
      if (j < 0 || j >= images.length) return;
      const next: string[] = [...images];
      [next[i], next[j]] = [next[j]!, next[i]!];
      void commit(next);
      announce(`Moved photo ${i + 1} ${dir < 0 ? "left" : "right"}`);
    },
    [images, commit, announce],
  );

  const makeCover = useCallback(
    (i: number) => {
      if (i <= 0 || i >= images.length) return;
      const next: string[] = [...images];
      const picked: string = next[i]!;
      next.splice(i, 1);
      next.unshift(picked);
      void commit(next);
      announce(`Photo ${i + 1} set as cover`);
    },
    [images, commit, announce],
  );

  // ----- drag & drop reorder -----
  const onDragStart = useCallback(
    (i: number) => () => {
      if (!draggable) return;
      setDragIdx(i);
    },
    [draggable],
  );

  const onDragOver = useCallback(
    (i: number) => (e: React.DragEvent) => {
      if (!draggable) return;
      e.preventDefault();
      setDragOverIdx(i);
    },
    [draggable],
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
      const next: string[] = [...images];
      const picked: string = next[dragIdx]!;
      next.splice(dragIdx, 1);
      next.splice(i, 0, picked);
      void commit(next);
      announce(`Moved photo ${dragIdx + 1} to position ${i + 1}`);
      onDragEnd();
    },
    [draggable, dragIdx, images, commit, onDragEnd, announce],
  );

  // ----- pick files (button/tile) -----
  const pickFiles = useCallback(() => inputRef.current?.click(), []);

  // ----- normalize selected files (from input, drop, paste) -----
  const handleFiles = useCallback(
    async (files: File[]) => {
      setErrorMsg("");
      if (!files.length) return;

      const allowed = Math.max(0, CAP - images.length);
      if (allowed <= 0) {
        setErrorMsg(`You can upload up to ${CAP} photos.`);
        return;
      }

      const chosen = files.slice(0, allowed);
      const maxBytes = Math.max(1, maxSizeMB) * 1024 * 1024;

      const bad: string[] = [];
      const fresh: File[] = [];

      for (const f of chosen) {
        if (!isAccepted(f, accept)) {
          bad.push(`"${f.name || "file"}" is not an accepted file type.`);
          continue;
        }
        if (f.size > maxBytes) {
          const mb = (f.size / (1024 * 1024)).toFixed(1);
          bad.push(`"${f.name || "file"}" is ${mb}MB (max ${maxSizeMB}MB).`);
          continue;
        }
        const sig = fileSig(f);
        if (pickedSigs.current.has(sig)) {
          // silently ignore duplicates picked in this session
          continue;
        }
        pickedSigs.current.add(sig);
        fresh.push(f);
      }

      if (bad.length) setErrorMsg(bad.join(" "));

      if (fresh.length && onFilesSelectedAction) {
        try {
          setBusy(true);
          await onFilesSelectedAction(fresh);
          announce(fresh.length === 1 ? "1 file selected" : `${fresh.length} files selected`);
        } finally {
          setBusy(false);
        }
      }
    },
    [images.length, CAP, accept, maxSizeMB, onFilesSelectedAction, announce],
  );

  // ----- input change -----
  const onFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      // Capture the input element first, then clear it before awaiting
      const input = e.currentTarget;
      const files = Array.from(input.files || []);
      input.value = "";
      await handleFiles(files);
    },
    [handleFiles],
  );

  // ----- drag & drop files onto the whole component -----
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;

    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        setDropping(true);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (!canAddMore) return;
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      // Ignore child leave; only reset when leaving root
      if (e.target === node) setDropping(false);
    };
    const onDropEvent = async (e: DragEvent) => {
      e.preventDefault();
      setDropping(false);
      if (!canAddMore) return;
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      await handleFiles(files);
    };

    node.addEventListener("dragenter", onDragEnter);
    node.addEventListener("dragover", onDragOver);
    node.addEventListener("dragleave", onDragLeave);
    node.addEventListener("drop", onDropEvent);
    return () => {
      node.removeEventListener("dragenter", onDragEnter);
      node.removeEventListener("dragover", onDragOver);
      node.removeEventListener("dragleave", onDragLeave);
      node.removeEventListener("drop", onDropEvent);
    };
  }, [handleFiles, canAddMore]);

  // ----- paste from clipboard (screenshots!) -----
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (!canAddMore) return;
      const items = Array.from(e.clipboardData?.items || []);
      const files = items
        .filter((i) => i.kind === "file")
        .map((i) => i.getAsFile())
        .filter(Boolean) as File[];
      if (files.length) {
        await handleFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFiles, canAddMore]);

  const miniCtl =
    "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-40";

  return (
    <div
      ref={wrapRef}
      className={[
        "w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 transition shadow-soft sm:p-3",
        dropping ? "border-dashed bg-[var(--bg-subtle)] ring-2 ring-focus" : "",
        className,
      ].join(" ")}
      aria-busy={busy ? "true" : "false"}
      aria-describedby={`gu-help-${uid}`}
    >
      <span className="sr-only" aria-live="polite">
        {liveMsg}
      </span>

      <div className="flex items-center justify-between gap-2">
        <label
          className="text-sm font-extrabold tracking-tight text-[var(--text)]"
          htmlFor={`gu-files-${uid}`}
        >
          {labelText}
        </label>

        <div
          id={`gu-help-${uid}`}
          className="text-[11px] text-[var(--text-muted)] leading-relaxed sm:text-xs"
        >
          Drag & drop or paste images. Max {CAP}.
        </div>
      </div>

      {/* Grid */}
      <ul
        className="mt-2 grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 sm:gap-4 md:grid-cols-4"
        aria-label="Gallery images"
      >
        {/* Add tile */}
        {canAddMore && (
          <li className="relative rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg)] p-2 text-center">
            <div className="flex h-24 w-full items-center justify-center sm:h-28">
              <IconButton
                icon="upload"
                variant="outline"
                size="sm"
                labelText={busy ? "Uploading…" : "Upload photos"}
                loading={busy}
                onClick={pickFiles}
                disabled={busy}
                srLabel="Upload photos"
              />
            </div>
          </li>
        )}

        {images.length === 0 && (
          <li className="col-span-full">
            <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg)] p-4 text-center text-sm text-[var(--text-muted)] leading-relaxed sm:p-6">
              No photos yet. Click{" "}
              <span className="font-semibold text-[var(--text)]">Upload photos</span>, drag
              &amp; drop, or paste.
            </div>
          </li>
        )}

        {images.map((url, i) => {
          const isOver = dragOverIdx === i;
          return (
            <li
              key={`${url}-${i}`}
              className={[
                "relative rounded-xl border bg-[var(--bg)] p-2 transition",
                isOver ? "border-[var(--border)] ring-2 ring-focus" : "border-[var(--border-subtle)]",
              ].join(" ")}
              draggable={draggable}
              onDragStart={onDragStart(i)}
              onDragOver={onDragOver(i)}
              onDragEnd={onDragEnd}
              onDrop={onDrop(i)}
              aria-roledescription="Draggable gallery item"
              aria-grabbed={dragIdx === i}
            >
              <div className="relative h-24 w-full overflow-hidden rounded-xl bg-[var(--bg-subtle)] sm:h-28">
                <SmartImage src={url} alt={`Photo ${i + 1}`} fill className="object-cover" />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--text)] sm:text-xs">
                <span className="truncate text-[var(--text-muted)]">
                  {i === 0 ? "Cover" : `#${i + 1}`}
                </span>

                <div className="flex gap-1">
                  <button
                    type="button"
                    className={miniCtl}
                    onClick={() => move(i, -1)}
                    title="Move left"
                    aria-label={`Move photo ${i + 1} left`}
                    disabled={i === 0}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className={miniCtl}
                    onClick={() => move(i, +1)}
                    title="Move right"
                    aria-label={`Move photo ${i + 1} right`}
                    disabled={i === images.length - 1}
                  >
                    →
                  </button>
                  {i !== 0 && (
                    <button
                      type="button"
                      className={miniCtl}
                      onClick={() => makeCover(i)}
                      title="Make cover"
                      aria-label={`Make photo ${i + 1} the cover`}
                    >
                      ★
                    </button>
                  )}
                  <button
                    type="button"
                    className={miniCtl}
                    onClick={() => removeAt(i)}
                    title="Remove"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Controls row */}
      <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-3">
        <IconButton
          icon="upload"
          labelText={busy ? "Uploading…" : "Upload photos"}
          variant="outline"
          size="sm"
          loading={busy}
          onClick={pickFiles}
          disabled={!canAddMore || busy}
          srLabel="Upload photos"
        />
        <input
          id={`gu-files-${uid}`}
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={onFiles}
        />
        <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
          {images.length}/{CAP} images
        </div>
        {errorMsg && (
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] text-[var(--text)] sm:text-xs"
            role="alert"
          >
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}
