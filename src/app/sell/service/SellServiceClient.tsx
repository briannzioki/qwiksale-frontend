"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { categories } from "../../data/categories";
import toast from "react-hot-toast";
import { formatKES } from "@/app/lib/money";
import { validateKenyanPhone, normalizeKenyanPhone } from "@/app/lib/phone";

type FilePreview = { file: File; url: string; key: string };
type Me = { id: string; email: string | null; profileComplete: boolean; whatsapp?: string | null };

const MAX_FILES = 6;
const MAX_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Cloudinary (client-safe) — mirror SellClient
const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";
const UPLOAD_PRESET = process.env["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"] ?? ""; // unsigned preset if available

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

  // Prefer unsigned (simpler)
  if (UPLOAD_PRESET) {
    fd.append("upload_preset", UPLOAD_PRESET);
    fd.append("folder", folder);
    const res = await fetch(endpoint, { method: "POST", body: fd });
    const json: any = await res.json();
    if (!res.ok || !json.secure_url) throw new Error(json?.error?.message || "Cloudinary upload failed");
    return { secure_url: json.secure_url, public_id: json.public_id };
  }

  // Signed: get signature from our API
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

  // XHR for progress (signed flow)
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

export default function SellServiceClient() {
  const router = useRouter();

  // ---------------------- Profile Gate (no server redirects) ----------------------
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // ----------------------------- Form state -----------------------------
  const [name, setName] = useState<string>(""); // service title (e.g., "House Cleaning")
  const [rate, setRate] = useState<number | "">("");
  const [rateUnit, setRateUnit] = useState<"hour" | "fixed">("hour");
  const [negotiable, setNegotiable] = useState<boolean>(false);

  const [serviceArea, setServiceArea] = useState<string>("Nairobi"); // area/coverage
  const [availability, setAvailability] = useState<"weekdays" | "weekends" | "24/7">("weekdays");
  const [experienceYears, setExperienceYears] = useState<number | "">("");

  // Category is locked to "Services"; subcategory limited to Services tree
  const [category] = useState<string>("Services");
  const [subcategory, setSubcategory] = useState<string>("");

  const [location, setLocation] = useState<string>("Nairobi"); // meeting/dispatch location (if needed)
  const [phone, setPhone] = useState<string>(""); // prefill from /api/me.whatsapp
  const [description, setDescription] = useState<string>("");
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadPct, setUploadPct] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Prefill phone from profile (matching SellClient logic)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });

        // explicit 401 redirect remains
        if (res.status === 401) {
          if (!cancelled) {
            router.replace(`/signin?callbackUrl=${encodeURIComponent("/sell/service")}`);
          }
          return;
        }
        // handle other non-OKs gracefully (scan-friendly: uses res.ok)
        if (!res.ok) {
          if (!cancelled) {
            setAllowed(true); // fail-open
            setReady(true);
          }
          return;
        }

        const me = (await res.json().catch(() => null)) as Me | null;

        if (!cancelled && me && me.profileComplete === false) {
          router.replace(`/account/complete-profile?next=${encodeURIComponent("/sell/service")}`);
          return;
        }

        if (!cancelled && !phone && me?.whatsapp) setPhone(me.whatsapp);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Readonly-friendly typing for categories data, filter to Services only
  type SubCat = { readonly name: string; readonly subsubcategories?: readonly string[] };
  type Cat = { readonly name: string; readonly subcategories: readonly SubCat[] };
  const cats: readonly Cat[] = categories as unknown as readonly Cat[];

  const serviceSubcats: ReadonlyArray<{ name: string }> = useMemo(() => {
    const services = cats.find((c) => c.name === "Services");
    const list = (services?.subcategories ?? []).map((s) => ({ name: s.name }));
    return list as ReadonlyArray<{ name: string }>;
  }, [cats]);

  useEffect(() => {
    if (!serviceSubcats.length) {
      setSubcategory("");
      return;
    }
    const first = serviceSubcats[0];
    if (!serviceSubcats.some((s) => s.name === subcategory)) {
      if (first) setSubcategory(String(first.name));
    }
  }, [serviceSubcats, subcategory]);

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const normalizedPhone = phone ? normalizeKenyanPhone(phone) ?? "" : "";
  const rateNum = rate === "" ? 0 : Number(rate);
  const phoneOk = !phone || validateKenyanPhone(phone).ok;

  const canSubmit =
    name.trim().length >= 3 &&
    !!subcategory &&
    description.trim().length >= 10 &&
    (rate === "" || (typeof rate === "number" && rate >= 0)) &&
    (experienceYears === "" || (typeof experienceYears === "number" && experienceYears >= 0)) &&
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

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setUploadPct(0);

    try {
      // Upload to Cloudinary if files present
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

      const imageUrl =
        uploaded[0]?.secure_url || previews[0]?.url || "/placeholder/default.jpg";
      const gallery = uploaded.length
        ? uploaded.map((u) => u.secure_url)
        : previews.map((p) => p.url);

      // Payload for creation — API expects `price` and `rateType`
      const payload = {
        name: name.trim(),
        description: description.trim(),
        category, // "Services"
        subcategory,
        price: rate === "" ? null : Math.max(0, Math.round(Number(rate))), // null => contact for quote
        rateType: rateUnit, // "hour" | "fixed"
        serviceArea: serviceArea.trim(),
        availability, // "weekdays" | "weekends" | "24/7"
        image: imageUrl,
        gallery,
        location: location.trim(),
        // Optional per-listing override; if empty the server will use profile whatsapp
        sellerPhone: normalizedPhone || undefined,
        // extra client-only fields (ignored server-side but harmless):
        negotiable,
        experienceYears: experienceYears === "" ? undefined : Math.max(0, Number(experienceYears)),
      };

      const r = await fetch("/api/services/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || (j as any)?.error) {
        throw new Error((j as any)?.error || `Failed to create (${r.status})`);
      }

      const createdId = String((j as any).id || (j as any).serviceId || "");
      toast.success("Service posted!");
      router.push(createdId ? `/sell/success?id=${createdId}` : "/sell/success");
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error(err?.message || "Failed to post service.");
    } finally {
      setSubmitting(false);
      setUploadPct(0);
    }
  }

  if (!ready || !allowed) {
    return (
      <div className="container-page py-10">
        <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft">
          <h1 className="text-2xl font-bold">Offer a Service</h1>
          <p className="text-white/90">Checking your account…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6">
      {/* Header card */}
      <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
        <h1 className="text-2xl font-bold text-balance">Offer a Service</h1>
        <p className="text-white/90">List your service — it takes less than 2 minutes.</p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
        {/* Title & Rate */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="label">Service Title</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. House Cleaning / Mama Fua"
              required
              minLength={3}
              aria-label="Service title"
            />
          </div>
          <div>
            <label className="label">Rate (KES)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="input"
              value={rate}
              onChange={(e) => setRate(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="e.g. 800"
              aria-describedby="rate-help"
              aria-label="Rate in Kenyan shillings"
            />
            <div className="mt-2 flex items-center gap-2">
              <select
                className="select"
                value={rateUnit}
                onChange={(e) => setRateUnit(e.target.value as "hour" | "fixed")}
                aria-label="Rate unit"
              >
                <option value="hour">per hour</option>
                <option value="fixed">fixed</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 dark:border-slate-600"
                  checked={negotiable}
                  onChange={(e) => setNegotiable(e.target.checked)}
                  aria-label="Negotiable rate"
                />
                Negotiable
              </label>
            </div>
            {typeof rate === "number" && rate > 0 && (
              <div className="text-xs mt-1 text-gray-600 dark:text-slate-400">
                You entered: {formatKES(rateNum)} {rateUnit === "hour" ? "per hour" : "(fixed)"}
              </div>
            )}
            <p id="rate-help" className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Leave empty for <em>Contact for rate</em>.
            </p>
          </div>
        </div>

        {/* Category (locked), Subcategory, Area */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Category</label>
            <input className="input" value="Services" readOnly aria-label="Category (Services)" />
          </div>
          <div>
            <label className="label">Subcategory</label>
            <select
              className="select"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              aria-label="Service subcategory"
            >
              {serviceSubcats.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Service Area</label>
            <input
              className="input"
              value={serviceArea}
              onChange={(e) => setServiceArea(e.target.value)}
              placeholder="e.g. Nairobi, Westlands, CBD"
              aria-label="Service area"
            />
          </div>
        </div>

        {/* Availability, Experience, Location */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Availability</label>
            <select
              className="select"
              value={availability}
              onChange={(e) => setAvailability(e.target.value as "weekdays" | "weekends" | "24/7")}
              aria-label="Availability"
            >
              <option value="weekdays">Weekdays</option>
              <option value="weekends">Weekends</option>
              <option value="24/7">24/7</option>
            </select>
          </div>
          <div>
            <label className="label">Experience (years, optional)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={experienceYears}
              onChange={(e) =>
                setExperienceYears(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))
              }
              placeholder="e.g. 3"
              aria-label="Experience in years"
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
        </div>

        {/* Phone (optional) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label className="label">Phone (WhatsApp, optional)</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XXXXXXXX or 2547XXXXXXXX"
              aria-invalid={!!phone && !validateKenyanPhone(phone).ok}
              aria-label="WhatsApp phone number (optional)"
            />
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Normalized: <code className="font-mono">{normalizedPhone || "—"}</code>
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
            placeholder="Describe your service, scope, supplies, response time, guarantees, etc."
            required
            minLength={10}
            aria-label="Service description"
          />
        </div>

        {/* Images + Uploader */}
        <div>
          <label className="label">Photos (up to {MAX_FILES})</label>

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
                <span className="ml-2 text-xs">
                  (JPG/PNG/WebP/GIF, up to {MAX_MB}MB each)
                </span>
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
            aria-label="Post service"
          >
            {submitting ? "Posting…" : "Post Service"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-outline" aria-label="Cancel">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
