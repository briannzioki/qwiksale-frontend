// src/app/sell/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { categories } from "../data/categories";
import { useProducts } from "../lib/productsStore";
import toast from "react-hot-toast";

type FilePreview = { file: File; url: string; key: string };

const MAX_FILES = 6;
const MAX_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// --- helpers ---
function normalizePhone(raw: string): string {
  let s = (raw || "").replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1); // 07 -> 2547
  if (/^\+2547\d{8}$/.test(s)) s = s.replace(/^\+/, ""); // +2547 -> 2547
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12); // trim paste
  return s;
}

function isValidPhone(msisdn: string): boolean {
  return /^2547\d{8}$/.test(msisdn) || /^\d{9,}$/.test(msisdn); // allow local for now, normalize later
}

function fmtKES(n: number) {
  try {
    return new Intl.NumberFormat("en-KE").format(n);
  } catch {
    return n.toString();
  }
}

export default function SellClient() {
  const router = useRouter();
  const { addProduct } = useProducts();

  // Form state
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [negotiable, setNegotiable] = useState(false);
  const [condition, setCondition] = useState<"brand new" | "pre-owned">("brand new");
  const [category, setCategory] = useState(categories[0]?.name || "");
  const [subcategory, setSubcategory] = useState("");
  const [brand, setBrand] = useState("");
  const [location, setLocation] = useState("Nairobi");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const subcats = useMemo(
    () => categories.find((c) => c.name === category)?.subcategories || [],
    [category]
  );

  // Ensure subcategory is always in sync with category
  useEffect(() => {
    if (!subcats.length) {
      setSubcategory("");
      return;
    }
    if (!subcats.find((s) => s.name === subcategory)) {
      setSubcategory(subcats[0].name);
    }
  }, [subcats, subcategory]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  // Derived validations
  const normalizedPhone = normalizePhone(phone);
  const priceNum = price === "" ? 0 : Number(price);
  const canSubmit =
    name.trim().length >= 3 &&
    !!category &&
    !!subcategory &&
    description.trim().length >= 10 &&
    (price === "" || (typeof price === "number" && price >= 0)) &&
    isValidPhone(phone);

  // --- image handlers ---
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
      // Deduplicate by name+size+lastModified
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (previews.some((p) => p.key === key) || next.some((p) => p.key === key)) {
        continue;
      }
      const url = URL.createObjectURL(f);
      next.push({ file: f, url, key });
    }

    if (!next.length) return;
    setPreviews((prev) => {
      const merged = [...prev, ...next].slice(0, MAX_FILES);
      return merged;
    });
  }

  function onFileInputChange(files: FileList | null) {
    if (!files || !files.length) return;
    filesToAdd(files);
    // reset input so selecting same file again re-triggers
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) {
      filesToAdd(e.dataTransfer.files);
    }
  }

  function removeAt(idx: number) {
    setPreviews((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return copy;
    });
  }

  function move(idx: number, dir: -1 | 1) {
    setPreviews((prev) => {
      const copy = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= copy.length) return copy;
      const tmp = copy[idx];
      copy[idx] = copy[j];
      copy[j] = tmp;
      return copy;
    });
  }

  // --- submit ---
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);

    try {
      // NOTE: These are blob: URLs; swap to Cloudinary/UploadThing for persistence.
      const imageUrl = previews[0]?.url ?? "/placeholder/default.jpg";
      const gallery = previews.map((p) => p.url);

      await addProduct({
        name: name.trim(),
        description: description.trim(),
        category,
        subcategory,
        brand: brand || undefined,
        condition,
        price: price === "" ? 0 : Math.max(0, Math.round(Number(price))),
        image: imageUrl,
        gallery,
        location: location.trim(),
        negotiable,
        // flattened seller fields (anon flow)
        sellerName: "Private Seller",
        sellerPhone: normalizePhone(phone),
        sellerLocation: location.trim(),
        sellerMemberSince: new Date().getFullYear().toString(),
        sellerRating: 4.5,
        sellerSales: 1,
      });

      toast.success("Listing posted!");
      router.push("/");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to post listing.");
    } finally {
      setSubmitting(false);
    }
  }

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
                You entered: KES {fmtKES(price)}
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
              onChange={(e) => setCondition(e.target.value as any)}
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
              {categories.map((c) => (
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
            >
              {subcats.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Brand, Location, Phone */}
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
            <label className="label">Phone (WhatsApp)</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XXXXXXXX or 2547XXXXXXXX"
              required
              minLength={9}
              aria-invalid={!isValidPhone(phone)}
            />
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Will be shared with buyers. Normalized:{" "}
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

        {/* Images */}
        <div>
          <label className="label">Photos (up to {MAX_FILES})</label>

          {/* Dropzone */}
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
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-outline"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
