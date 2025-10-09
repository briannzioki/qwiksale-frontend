// src/app/sell/service/SellServiceClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import SuggestInput from "@/app/components/SuggestInput";

const SERVICE_CATEGORIES = [
  { name: "Home Services", subcategories: [{ name: "Cleaning" }, { name: "Repairs" }] },
  { name: "Automotive", subcategories: [{ name: "Mechanic" }, { name: "Car Wash" }] },
  { name: "Events", subcategories: [{ name: "Photography" }, { name: "Catering" }] },
] as const;

type FilePreview = { file: File; url: string; key: string };
type Me = { id: string; email: string | null; profileComplete?: boolean; whatsapp?: string | null };

type Props = {
  /** If present, load existing service and PATCH on submit */
  editId?: string | null | undefined; // allow explicit undefined for exactOptionalPropertyTypes
  /** If true, hides the legacy media uploader block to avoid duplication with a page-level media manager. */
  hideMedia?: boolean;
};

const MAX_FILES = 6;
const MAX_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Cloudinary (client-safe)
const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";
const UPLOAD_PRESET = process.env["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"] ?? "";

/* ----------------------------- Phone helpers ----------------------------- */
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

/* --------------------------- Cloudinary uploader -------------------------- */
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

  // Signed fallback if you're not using unsigned uploads
  const sigRes = await fetch(`/api/upload/sign?folder=${encodeURIComponent(folder)}`, {
    method: "GET",
    cache: "no-store",
  });
  const sigJson: any = await sigRes.json();
  if (!sigRes.ok) throw new Error(sigJson?.error || "Failed to get upload signature");

  fd.append("api_key", sigJson.apiKey);
  fd.append("timestamp", String(sigJson.timestamp));
  fd.append("signature", sigJson.signature);
  fd.append("folder", folder);

  const xhr = new XMLHttpRequest();
  const p = new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && opts?.onProgress) {
        opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        try {
          const j = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && j.secure_url) {
            resolve({ secure_url: j.secure_url, public_id: j.public_id });
          } else {
            reject(new Error(j?.error?.message || `Cloudinary upload failed (${xhr.status})`));
          }
        } catch (e: any) {
          reject(new Error(e?.message || "Cloudinary response parse error"));
        }
      }
    };
    xhr.open("POST", endpoint, true);
    xhr.send(fd);
  });
  return p;
}

export default function SellServiceClient({ editId, hideMedia }: Props) {
  const router = useRouter();

  // ---------------------- Profile Gate (no server redirects) ----------------------
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // ----------------------------- Form state -----------------------------
  const [name, setName] = useState<string>("");
  const [price, setPrice] = useState<number | "">("");
  const [rateType, setRateType] = useState<"hour" | "day" | "fixed">("fixed");

  const [category, setCategory] = useState<string>(String(SERVICE_CATEGORIES[0]?.name || "Services"));
  const [subcategory, setSubcategory] = useState<string>(
    String(SERVICE_CATEGORIES[0]?.subcategories?.[0]?.name || "")
  );

  const [serviceArea, setServiceArea] = useState<string>("Nairobi");
  const [availability, setAvailability] = useState<string>("Weekdays");
  const [location, setLocation] = useState<string>("Nairobi");
  const [phone, setPhone] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Images
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [existingGallery, setExistingGallery] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadPct, setUploadPct] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // keep phone in a ref so the effect doesn't depend on state
  const phoneRef = useRef<string>("");
  useEffect(() => {
    phoneRef.current = phone;
  }, [phone]);

  // Prefill phone from profile + gate checks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });

        if (res.status === 401) {
          if (!cancelled) router.replace(`/signin?callbackUrl=${encodeURIComponent("/sell/service")}`);
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setAllowed(true);
            setReady(true);
          }
          return;
        }

        const j = (await res.json().catch(() => null)) as any;
        const me: Me | null = j?.user ?? j ?? null;

        if (!cancelled && me && me.profileComplete === false) {
          router.replace(`/account/complete-profile?next=${encodeURIComponent("/sell/service")}`);
          return;
        }
        if (!cancelled && !phoneRef.current && me?.whatsapp) setPhone(me.whatsapp);

        if (!cancelled) setAllowed(true);
      } catch {
        if (!cancelled) setAllowed(true); // fail-open
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /* --------------------------- EDIT PREFILL LOGIC --------------------------- */
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/services/${encodeURIComponent(editId)}`, { cache: "no-store" });
        if (!r.ok) {
          toast.error("Unable to load service for editing.");
          return;
        }
        const s: any = await r.json();
        if (cancelled) return;

        setName(s?.name ?? "");
        setDescription(s?.description ?? "");
        setCategory(s?.category ?? "Services");
        setSubcategory(s?.subcategory ?? "");
        setRateType((s?.rateType as "hour" | "day" | "fixed") ?? "fixed");
        setPrice(typeof s?.price === "number" ? s.price : s?.price === null ? "" : "");
        setServiceArea(s?.serviceArea ?? s?.location ?? "Nairobi");
        setAvailability(s?.availability ?? "Weekdays");
        setLocation(s?.location ?? s?.serviceArea ?? "Nairobi");
        setPhone(s?.sellerPhone ?? "");

        setExistingImage(s?.image ?? null);
        setExistingGallery(Array.isArray(s?.gallery) ? s.gallery : []);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error(e);
        toast.error("Failed to prefill service.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  // Derived options (local)
  type Sub = { readonly name: string };
  type Cat = { readonly name: string; readonly subcategories: readonly Sub[] };
  const cats: readonly Cat[] = SERVICE_CATEGORIES;

  const subcats = useMemo(() => {
    const found = cats.find((c) => c.name === category);
    return (found?.subcategories ?? []) as readonly Sub[];
  }, [cats, category]);

  useEffect(() => {
    if (!subcats.length) {
      setSubcategory("");
      return;
    }
    if (!subcats.some((s) => s.name === subcategory)) {
      setSubcategory(subcats[0]?.name || "");
    }
  }, [subcats, subcategory]);

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const normalizedPhone = phone ? normalizePhone(phone) : "";
  const phoneOk = !phone || looksLikeValidKePhone(phone);

  const canSubmit =
    name.trim().length >= 3 &&
    !!category &&
    description.trim().length >= 10 &&
    phoneOk;

  /* -------------------------------- Files -------------------------------- */
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

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) filesToAdd(e.dataTransfer.files);
  }

  function removeAt(idx: number) {
    setPreviews((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function move(idx: number, dir: -1 | 1) {
    setPreviews((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const a = prev.slice();
      const left = a[idx];
      const right = a[j];
      if (!left || !right) return prev;
      a[idx] = right;
      a[j] = left;
      return a;
    });
  }

  /* -------------------------------- Submit -------------------------------- */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Please fill all required fields.");
      return;
    }
    // ✅ Guard: avoid blob: URLs in payload when Cloudinary isn’t configured
    if (previews.length && !CLOUD_NAME) {
      toast.error(
        "Image uploads are not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (and optionally NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET)."
      );
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setUploadPct(0);

    try {
      // Upload images if added
      let uploaded: { secure_url: string; public_id: string }[] = [];
      if (previews.length) {
        if (!CLOUD_NAME) {
          throw new Error(
            "Cloudinary not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (and optionally NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET)."
          );
        }
        const total = previews.length;
        let done = 0;
        for (const p of previews) {
          const item = await uploadToCloudinary(p.file, {
            folder: "qwiksale/services",
            onProgress: (pct) => {
              const overall = Math.round(((done + pct / 100) / total) * 100);
              setUploadPct(overall);
            },
          });
          uploaded.push(item);
          done += 1;
          setUploadPct(Math.round((done / total) * 100));
        }
      }

      // If no new images during EDIT, keep existing
      const computedImage =
        uploaded[0]?.secure_url ??
        previews[0]?.url ??
        existingImage ??
        "/placeholder/default.jpg";

      const computedGallery =
        uploaded.length
          ? uploaded.map((u) => u.secure_url)
          : previews.length
          ? previews.map((p) => p.url)
          : (existingGallery?.length ? existingGallery : []);

      const payload = {
        name: name.trim(),
        description: description.trim(),
        category,
        subcategory: subcategory || undefined,
        price: price === "" ? null : Math.max(0, Math.round(Number(price))),
        rateType,
        serviceArea: serviceArea || undefined,
        availability: availability || undefined,
        image: computedImage,
        gallery: computedGallery,
        location: location.trim(),
        sellerPhone: normalizePhone(phone) || undefined,
      };

      let resultId: string | null = null;

      if (editId) {
        // PATCH existing
        const r = await fetch(`/api/services/${encodeURIComponent(editId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({} as any));
        if (!r.ok || (j as any)?.error) {
          throw new Error((j as any)?.error || `Failed to update (${r.status})`);
        }
        resultId = editId;
        toast.success("Service updated!");
      } else {
        // POST new
        const r = await fetch("/api/services/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        if (r.status === 429) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || "You’re posting too fast. Please slow down.");
        }
        const j = await r.json().catch(() => ({} as any));
        if (!r.ok || (j as any)?.error) {
          throw new Error((j as any)?.error || `Failed to create (${r.status})`);
        }
        resultId = String((j as any)?.serviceId || "");
        toast.success("Service posted!");
      }

      router.push(resultId ? `/service/${resultId}` : "/");
      router.refresh();
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error(err?.message || (editId ? "Failed to update service." : "Failed to post service."));
    } finally {
      setSubmitting(false);
      setUploadPct(0);
    }
  }

  if (!ready || !allowed) {
    return (
      <div className="container-page py-10">
        <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft">
          <h1 className="text-2xl font-bold">{editId ? "Edit Service" : "Post a Service"}</h1>
          <p className="text-white/90">Checking your account…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6">
      {/* Header card */}
      <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
        <h1 className="text-2xl font-bold text-balance">
          {editId ? "Edit Service" : "Post a Service"}
        </h1>
        <p className="text-white/90">
          {editId ? "Update your service details." : "List your service — it takes less than 2 minutes."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
        {/* Name & Price */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            {/* ✅ Wrap the SuggestInput with the label so the input is labeled */}
            <label className="label block">
              Service Name
              <SuggestInput
                endpoint="/api/services/suggest"
                value={name}
                onChangeAction={async (next) => setName(next)}
                onPickAction={async (item) => {
                  if (item.type === "service" || item.type === "name") {
                    setName(item.value);
                  } else if (item.type === "subcategory") {
                    const parts = item.value.split("•").map((s) => s.trim());
                    if (parts.length === 2) {
                      setCategory(parts[0] || category);
                      setSubcategory(parts[1] || subcategory);
                    } else {
                      setSubcategory(item.value);
                    }
                  } else if (item.type === "category") {
                    setCategory(item.value);
                  }
                }}
                placeholder="e.g. Deep Cleaning for Apartments"
                typesAllowed={["service", "name", "subcategory", "category"]}
                inputClassName="input mt-1"
              />
            </label>
          </div>

          <div>
            <label className="label">Base Price (KES)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="input"
              value={price}
              onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="e.g. 1500 (leave blank for quote)"
              aria-describedby="price-help"
              aria-label="Price in Kenyan shillings"
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            />
            <p id="price-help" className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Leave empty for <em>Contact for quote</em>.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="rateType"
                  value="fixed"
                  checked={rateType === "fixed"}
                  onChange={() => setRateType("fixed")}
                  className="rounded border-gray-300 dark:border-slate-600"
                />
                Fixed
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="rateType"
                  value="hour"
                  checked={rateType === "hour"}
                  onChange={() => setRateType("hour")}
                  className="rounded border-gray-300 dark:border-slate-600"
                />
                /hour
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="rateType"
                  value="day"
                  checked={rateType === "day"}
                  onChange={() => setRateType("day")}
                  className="rounded border-gray-300 dark:border-slate-600"
                />
                /day
              </label>
            </div>
          </div>
        </div>

        {/* Category, Subcategory, Area */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Category</label>
            <select
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
            >
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Subcategory</label>
            <select
              className="select"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              aria-label="Subcategory"
            >
              {subcats.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="mt-2">
              <SuggestInput
                endpoint="/api/services/suggest"
                value=""
                onChangeAction={async () => {
                  /* picks drive state */
                }}
                onPickAction={async (item) => {
                  if (item.type === "subcategory") {
                    const parts = item.value.split("•").map((s) => s.trim());
                    if (parts.length === 2) {
                      setCategory(parts[0] || category);
                      setSubcategory(parts[1] || subcategory);
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
                placeholder="Quick pick: type to find a category/subcategory"
                typesAllowed={["subcategory", "category", "service", "name"]}
                inputClassName="input"
              />
            </div>
          </div>
          <div>
            <label className="label">Service Area (optional)</label>
            <input
              className="input"
              value={serviceArea}
              onChange={(e) => setServiceArea(e.target.value)}
              placeholder="e.g. Nairobi CBD, Westlands"
              aria-label="Service area"
            />
          </div>
        </div>

        {/* Availability, Location, Phone */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Availability (optional)</label>
            <input
              className="input"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              placeholder="e.g. Mon–Sat 8am–6pm"
              aria-label="Availability"
            />
          </div>
          <div>
            <label className="label">Base Location</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Nairobi"
              aria-label="Location"
            />
          </div>
          <div>
            <label className="label">Phone (WhatsApp, optional)</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XXXXXXXX or 2547XXXXXXXX"
              aria-invalid={!!phone && !looksLikeValidKePhone(phone)}
              aria-label="WhatsApp phone number (optional)"
            />
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              If provided, we’ll normalize as <code className="font-mono">{normalizedPhone || "—"}</code>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your service, experience, what’s included, etc."
            required
            minLength={10}
            aria-label="Service description"
          />
        </div>

        {/* Images + Uploader (legacy surface) */}
        {!hideMedia && (
          <div>
            <label className="label">Photos (up to {MAX_FILES})</label>

            {editId && (existingImage || (existingGallery?.length ?? 0) > 0) && (
              <p className="text-xs text-gray-600 dark:text-slate-400 mb-2">
                Existing photos will be kept if you don’t upload new ones.
              </p>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={onDrop}
              className="card p-4 border-dashed border-2 border-gray-200 dark:border-slate-700/70"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Drag & drop images here, or choose files.
                  <span className="ml-2 text-xs">(JPG/PNG/WebP/GIF, up to {MAX_MB}MB each)</span>
                </p>
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    multiple
                    onChange={(e) => onFileInputChange(e.target.files)}
                    className="hidden"
                    id="file-input"
                  />
                  <label htmlFor="file-input" className="btn-outline cursor-pointer">
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
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition" />
                      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="btn-outline px-2 py-1 text-xs"
                          title="Move left"
                          aria-label="Move image left"
                        >
                          ◀
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, +1)}
                          disabled={i === previews.length - 1}
                          className="btn-outline px-2 py-1 text-xs"
                          title="Move right"
                          aria-label="Move image right"
                        >
                          ▶
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAt(i)}
                          className="btn-danger px-2 py-1 text-xs"
                          title="Remove"
                          aria-label="Remove image"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {submitting && uploadPct > 0 && (
                <div className="mt-3" aria-live="polite">
                  <div className="h-2 w-full bg-gray-200 rounded">
                    <div className="h-2 bg-emerald-500 rounded transition-all" style={{ width: `${uploadPct}%` }} />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Uploading images… {uploadPct}%</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={`btn-gradient-primary ${!canSubmit || submitting ? "opacity-60" : ""}`}
            aria-label={editId ? "Update service" : "Post service"}
          >
            {submitting ? (editId ? "Updating…" : "Posting…") : (editId ? "Update Service" : "Post Service")}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-outline" aria-label="Cancel">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
