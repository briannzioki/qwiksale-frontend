// src/app/sell/service/page.tsx
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import SuggestInput from "@/app/components/SuggestInput";

type Me = { id: string; email: string | null; profileComplete: boolean; whatsapp?: string | null };

type FilePreview = { file: File; url: string; key: string };

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILES = 6;
const MAX_MB = 5;

const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";
const UPLOAD_PRESET = process.env["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"] ?? "";

function normalizePhone(raw: string): string {
  const trimmed = (raw || "").trim();
  if (/^\+254(7|1)\d{8}$/.test(trimmed)) return trimmed.replace(/^\+/, "");
  let s = trimmed.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}
function looksLikeValidKePhone(input: string): boolean {
  return /^254(7|1)\d{8}$/.test(normalizePhone(input));
}
async function uploadToCloudinary(
  file: File,
  opts?: { onProgress?: (pct: number) => void; folder?: string }
): Promise<{ secure_url: string; public_id: string }> {
  if (!CLOUD_NAME) throw new Error("Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  const folder = opts?.folder || "qwiksale";
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
  const fd = new FormData();
  fd.append("file", file);

  if (UPLOAD_PRESET) {
    fd.append("upload_preset", UPLOAD_PRESET);
    fd.append("folder", folder);
    const res = await fetch(endpoint, { method: "POST", body: fd });
    const json: any = await res.json();
    if (!res.ok || !json.secure_url) {
      throw new Error(json?.error?.message || "Cloudinary upload failed");
    }
    return { secure_url: json.secure_url, public_id: json.public_id };
  }
  // signed flow not needed per your config
  throw new Error("Unsigned upload preset missing.");
}

function SellServiceInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const editingId = sp.get("id") || "";

  // form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Services");
  const [subcategory, setSubcategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [rateType, setRateType] = useState<"hour" | "day" | "fixed">("fixed");
  const [serviceArea, setServiceArea] = useState("Nairobi");
  const [availability, setAvailability] = useState("Weekdays");
  const [phone, setPhone] = useState("");
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [uploadPct, setUploadPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // prefill phone from /api/me
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.status === 401) {
          router.replace(`/signin?callbackUrl=${encodeURIComponent("/sell/service")}`);
          return;
        }
        const me = (await r.json().catch(() => null)) as Me | null;
        if (me?.profileComplete === false) {
          router.replace(`/account/complete-profile?next=${encodeURIComponent("/sell/service")}`);
          return;
        }
        if (!cancelled && me?.whatsapp) setPhone(me.whatsapp);
      } catch {
        /* fail open */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const normalizedPhone = phone ? normalizePhone(phone) : "";
  const phoneOk = !phone || looksLikeValidKePhone(phone);
  const priceNum = price === "" ? 0 : Number(price);

  const canSubmit =
    name.trim().length >= 3 &&
    description.trim().length >= 10 &&
    phoneOk;

  function filesToAdd(files: FileList | File[]) {
    const next: FilePreview[] = [];
    for (const f of Array.from(files)) {
      if (next.length + previews.length >= MAX_FILES) break;
      if (!ACCEPTED_TYPES.includes(f.type)) {
        toast.error(`Unsupported file: ${f.name}`);
        continue;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        toast.error(`${f.name} is larger than ${MAX_MB}MB`);
        continue;
      }
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (previews.some((p) => p.key === key) || next.some((p) => p.key === key)) continue;
      const url = URL.createObjectURL(f);
      next.push({ file: f, url, key });
    }
    if (!next.length) return;
    setPreviews((prev) => [...prev, ...next].slice(0, MAX_FILES));
  }
  function onFileInputChange(files: FileList | null) {
    if (!files || !files.length) return;
    filesToAdd(files);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(idx: number) {
    setPreviews((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setUploadPct(0);

    try {
      // optional images
      let uploaded: { secure_url: string; public_id: string }[] = [];
      if (previews.length) {
        if (!CLOUD_NAME) throw new Error("Cloudinary not configured");
        const total = previews.length;
        let done = 0;
        for (const p of previews) {
          const up = await uploadToCloudinary(p.file, {
            folder: "qwiksale/services",
            onProgress: (pct) =>
              setUploadPct(Math.round(((done + pct / 100) / total) * 100)),
          });
          uploaded.push(up);
          done += 1;
          setUploadPct(Math.round((done / total) * 100));
        }
      }

      const image = uploaded[0]?.secure_url ?? null;
      const gallery = uploaded.map((u) => u.secure_url);

      const payload = {
        name: name.trim(),
        description: description.trim(),
        category,
        subcategory: subcategory || undefined,
        price: price === "" ? null : Math.max(0, Math.round(Number(price))),
        rateType,
        serviceArea: serviceArea.trim(),
        availability: availability.trim(),
        image: image ?? undefined, // optional
        gallery: gallery.length ? gallery : undefined, // optional
        sellerPhone: normalizedPhone || undefined,
        location: serviceArea.trim(), // mirror
      };

      const res = await fetch("/api/services/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        keepalive: true,
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || (j as any)?.error) {
        throw new Error((j as any)?.error || `Failed (${res.status})`);
      }
      const id = String((j as any)?.serviceId || "");
      toast.success("Service posted!");
      router.push(id ? `/sell/success?id=${id}` : "/sell/success");
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error(err?.message || "Failed to post service.");
    } finally {
      setSubmitting(false);
      setUploadPct(0);
    }
  }

  return (
    <div className="container-page py-6">
      <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
        <h1 className="text-2xl font-bold">Post a Service</h1>
        <p className="text-white/90">List your service — images are optional.</p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Service name</label>
            <SuggestInput
              endpoint="/api/services/suggest"
              value={name}
              onChangeAction={async (next) => setName(next)}
              onPickAction={async (item) => {
                // Prefer sensible defaults from picks
                if (item.type === "service" || item.type === "name") {
                  setName(item.value);
                } else if (item.type === "subcategory") {
                  // handle "Category • Subcategory" combos
                  const parts = item.value.split("•").map((s) => s.trim());
                  if (parts.length === 2) {
                    setCategory(parts[0] || "Services");
                    setSubcategory(parts[1] || "");
                  } else {
                    setSubcategory(item.value);
                  }
                } else if (item.type === "category") {
                  setCategory(item.value);
                }
              }}
              placeholder="e.g. Mama Fua (house cleaning)"
              typesAllowed={["service", "name", "subcategory", "category"]}
              inputClassName="input"
            />
          </div>
          <div>
            <label className="label">Rate type</label>
            <select
              className="select"
              value={rateType}
              onChange={(e) => setRateType(e.target.value as any)}
            >
              <option value="fixed">Fixed</option>
              <option value="hour">Per hour</option>
              <option value="day">Per day</option>
            </select>
          </div>
        </div>

        {/* price & area */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Price (KES)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="input"
              value={price}
              onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Leave empty for 'Contact for quote'"
            />
          </div>
          <div>
            <label className="label">Service area</label>
            <input
              className="input"
              value={serviceArea}
              onChange={(e) => setServiceArea(e.target.value)}
              placeholder="e.g. Nairobi"
            />
          </div>
          <div>
            <label className="label">Availability</label>
            <input
              className="input"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              placeholder="e.g. Weekdays, 9am–6pm"
            />
          </div>
        </div>

        {/* phone (optional) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">WhatsApp (optional)</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XXXXXXXX or 2547XXXXXXXX"
              aria-invalid={!!phone && !looksLikeValidKePhone(phone)}
            />
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Normalized: <code className="font-mono">{normalizedPhone || "—"}</code>
            </div>
          </div>
          <div>
            <label className="label">Category / Subcategory (optional)</label>
            <SuggestInput
              endpoint="/api/services/suggest"
              value={subcategory}
              onChangeAction={async (next) => setSubcategory(next)}
              onPickAction={async (item) => {
                if (item.type === "subcategory") {
                  const parts = item.value.split("•").map((s) => s.trim());
                  if (parts.length === 2) {
                    setCategory(parts[0] || "Services");
                    setSubcategory(parts[1] || "");
                  } else {
                    setSubcategory(item.value);
                  }
                } else if (item.type === "category") {
                  setCategory(item.value);
                  setSubcategory("");
                } else if (item.type === "service" || item.type === "name") {
                  setSubcategory(item.value);
                }
              }}
              placeholder="e.g. Cleaning"
              typesAllowed={["subcategory", "category", "service", "name"]}
              inputClassName="input"
            />
          </div>
        </div>

        {/* description */}
        <div>
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your service, experience, tools, terms…"
            required
            minLength={10}
          />
        </div>

        {/* Images (optional) */}
        <div>
          <label className="label">Photos (optional, up to {MAX_FILES})</label>
          <div className="card p-4 border-dashed border-2 border-gray-200 dark:border-slate-700/70">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Images are optional, but they help build trust.
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  multiple
                  onChange={(e) => onFileInputChange(e.target.files)}
                  className="hidden"
                  id="svc-file-input"
                />
                <label htmlFor="svc-file-input" className="btn-outline cursor-pointer">
                  Choose files
                </label>
              </div>
            </div>

            {previews.length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {previews.map((p, i) => (
                  <div key={p.key} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={`Photo ${i + 1}`}
                      className="w-full h-32 object-cover rounded-lg border dark:border-slate-700"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={() => removeAt(i)}
                      className="absolute top-1 right-1 btn-danger px-2 py-1 text-xs"
                      title="Remove"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {submitting && uploadPct > 0 && (
              <div className="mt-3" aria-live="polite">
                <div className="h-2 w-full bg-gray-200 rounded">
                  <div
                    className="h-2 bg-emerald-500 rounded transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">Uploading images… {uploadPct}%</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={`btn-gradient-primary ${(!canSubmit || submitting) ? "opacity-60" : ""}`}
          >
            {submitting ? "Posting…" : "Post Service"}
          </button>
          <Link href="/" className="btn-outline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

export default function SellServicePage() {
  return (
    <Suspense fallback={<div />}>
      <SellServiceInner />
    </Suspense>
  );
}
