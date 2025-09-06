// src/app/sell/SellClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { categories } from "../data/categories";
import { useProducts } from "../lib/productsStore";
import toast from "react-hot-toast";

type FilePreview = { file: File; url: string; key: string };
type Me = { id: string; email: string | null; profileComplete: boolean };

const MAX_FILES = 6;
const MAX_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Cloudinary (client-safe)
const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";
const UPLOAD_PRESET = process.env["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"] ?? ""; // unsigned preset if you have one

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

/* ----------------------------- Money helper ----------------------------- */
function fmtKES(n: number) {
  try {
    return new Intl.NumberFormat("en-KE").format(n);
  } catch {
    return n.toString();
  }
}

/* --------------------------- Cloudinary uploader -------------------------- */
async function uploadToCloudinary(
  file: File,
  opts?: { onProgress?: (pct: number) => void; folder?: string }
): Promise<{ secure_url: string; public_id: string }> {
  if (!CLOUD_NAME) {
    throw new Error("Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  }
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
    if (!res.ok || !json.secure_url) {
      throw new Error(json?.error?.message || "Cloudinary upload failed");
    }
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

export default function SellClient() {
  const router = useRouter();

  // ---------------------- Profile Gate (no server redirects) ----------------------
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (cancelled) return;

        if (res.status === 401) {
          // Not signed in -> go to sign-in with return
          router.replace(`/signin?callbackUrl=${encodeURIComponent("/sell")}`);
          return;
        }

        const me = (await res.json().catch(() => null)) as Me | null;

        if (me && me.profileComplete === false) {
          // Signed in but needs profile completion
          router.replace(`/account/complete-profile?next=${encodeURIComponent("/sell")}`);
          return;
        }

        // OK to proceed
        setAllowed(true);
      } catch {
        // Fail-open to avoid accidental loops if /api/me is down
        setAllowed(true);
      } finally {
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Zustand store (optional)
  const store = useProducts() as any;
  const addProduct: (payload: any) => Promise<any> | any =
    store && typeof store.addProduct === "function"
      ? store.addProduct
      : async () => undefined;

  // ----------------------------- Form state -----------------------------
  const [name, setName] = useState<string>("");
  const [price, setPrice] = useState<number | "">("");
  const [negotiable, setNegotiable] = useState<boolean>(false);
  const [condition, setCondition] = useState<"brand new" | "pre-owned">("brand new");

  // 👇 explicitly typed as string to avoid literal-union narrowing from categories[0]?.name
  const [category, setCategory] = useState<string>(String(categories[0]?.name || ""));
  const [subcategory, setSubcategory] = useState<string>(""); // 👈 explicit string fixes TS narrowing

  const [brand, setBrand] = useState<string>("");
  const [location, setLocation] = useState<string>("Nairobi");
  const [phone, setPhone] = useState<string>(""); // OPTIONAL now
  const [description, setDescription] = useState<string>("");
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadPct, setUploadPct] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Readonly-friendly typing for categories data
  type SubCat = { readonly name: string; readonly subsubcategories?: readonly string[] };
  type Cat = { readonly name: string; readonly subcategories: readonly SubCat[] };

  // Keep as readonly; no mutation needed for rendering
  const cats: readonly Cat[] = categories as unknown as readonly Cat[];

  const subcats: ReadonlyArray<{ name: string }> = useMemo(() => {
    const found = cats.find((c) => c.name === category);
    const list = (found?.subcategories ?? []).map((s) => ({ name: s.name }));
    return list as ReadonlyArray<{ name: string }>;
  }, [cats, category]);

  useEffect(() => {
    if (!subcats.length) {
      setSubcategory("");
      return;
    }
    const first = subcats[0];
    if (!subcats.some((s) => s.name === subcategory)) {
      if (first) setSubcategory(String(first.name));
    }
  }, [subcats, subcategory]);

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const normalizedPhone = phone ? normalizePhone(phone) : "";
  const priceNum = price === "" ? 0 : Number(price);

  // Phone is optional; if provided, it must be valid
  const phoneOk = !phone || looksLikeValidKePhone(phone);

  const canSubmit =
    name.trim().length >= 3 &&
    !!category &&
    !!subcategory &&
    description.trim().length >= 10 &&
    (price === "" || (typeof price === "number" && price >= 0)) &&
    phoneOk;

  /* ------------------------------ Image helpers ------------------------------ */
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

  // ✅ Safe versions: no undefined writes, no direct mutation
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

  /* --------------------------------- Submit --------------------------------- */
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
            folder: "qwiksale/products",
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

      // Payload for creation (server will snapshot seller info)
      const payload = {
        name: name.trim(),
        description: description.trim(),
        category,
        subcategory,
        brand: brand || undefined,
        condition,
        price: price === "" ? undefined : Math.max(0, Math.round(Number(price))),
        image: imageUrl,
        gallery,
        location: location.trim(),
        negotiable,
        // Optional: let server ignore or use later
        sellerPhone: normalizedPhone || undefined,
      };

      // 1) Try Zustand store if present
      let created: any = await addProduct(payload);

      // 2) Fallback to server API if store doesn’t handle it
      if (!created) {
        const r = await fetch("/api/products/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({} as any));
        if (!r.ok || (j as any)?.error) {
          throw new Error((j as any)?.error || `Failed to create (${r.status})`);
        }
        created = { id: (j as any).productId };
      }

      const createdId =
        typeof created === "string"
          ? created
          : created && typeof created === "object" && "id" in created
          ? String((created as any).id)
          : "";

      toast.success("Listing posted!");
      router.push(createdId ? `/sell/success?id=${createdId}` : "/sell/success");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to post listing.");
    } finally {
      setSubmitting(false);
      setUploadPct(0);
    }
  }

  /* ------------------------------- Gate loading ------------------------------ */
  if (!ready || !allowed) {
    return (
      <div className="container-page py-10">
        <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft">
          <h1 className="text-2xl font-bold">Post a Listing</h1>
          <p className="text-white/90">Checking your account…</p>
        </div>
      </div>
    );
  }

  /* ----------------------------------- UI ----------------------------------- */
  return (
    <div className="container-page py-6">
      {/* Header card */}
      <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
        <h1 className="text-2xl font-bold text-balance">Post a Listing</h1>
        <p className="text-white/90">List your item — it takes less than 2 minutes.</p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        {/* Title & Price */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="label">Title</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. iPhone 13 Pro 256GB"
              required
              minLength={3}
            />
          </div>
          <div>
            <label className="label">Price (KES)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="input"
              value={price}
              onChange={(e) =>
                setPrice(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="e.g. 35000"
              aria-describedby="price-help"
            />
            <p id="price-help" className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Leave empty for <em>Contact for price</em>.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="rounded border-gray-300 dark:border-slate-600"
                checked={negotiable}
                onChange={(e) => setNegotiable(e.target.checked)}
              />
              Negotiable price
            </label>
            {typeof price === "number" && price > 0 && (
              <div className="text-xs mt-1 text-gray-600 dark:text-slate-400">
                You entered: KES {fmtKES(priceNum)}
              </div>
            )}
          </div>
        </div>

        {/* Condition, Category, Subcategory */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Condition</label>
            <select
              className="select"
              value={condition}
              onChange={(e) => setCondition(e.target.value as "brand new" | "pre-owned")}
            >
              <option value="brand new">Brand New</option>
              <option value="pre-owned">Pre-Owned</option>
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <select
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {cats.map((c) => (
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
              onChange={(e) => setSubcategory(e.target.value)} // ✅ state is string, no literal mismatch
            >
              {subcats.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Brand, Location, Phone (optional) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Brand (optional)</label>
            <input
              className="input"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Samsung"
            />
          </div>
          <div>
            <label className="label">Location</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Nairobi"
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
            />
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              If provided, we’ll normalize as{" "}
              <code className="font-mono">{normalizedPhone || "—"}</code>
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
            placeholder="Describe the item, condition, accessories, warranty, etc."
            required
            minLength={10}
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
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition" />
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="btn-ghost px-2 py-1 text-xs"
                        title="Move left"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, +1)}
                        disabled={i === previews.length - 1}
                        className="btn-ghost px-2 py-1 text-xs"
                        title="Move right"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAt(i)}
                        className="btn-danger px-2 py-1 text-xs"
                        title="Remove"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {submitting && uploadPct > 0 && (
              <div className="mt-3">
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
            className={`btn-primary ${(!canSubmit || submitting) && "opacity-60"}`}
          >
            {submitting ? "Posting…" : "Post Listing"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-outline">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
