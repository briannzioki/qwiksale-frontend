"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";

type ProductPayload = {
  name: string;
  description?: string | null;
  category: string;
  subcategory: string;
  brand?: string | null;
  condition?: "brand new" | "pre-owned" | null;
  price?: number | null;
  image?: string | null;
  gallery?: string[];
  location?: string | null;
  negotiable?: boolean;
};

type LoadedProduct = ProductPayload & {
  id: string;
  featured?: boolean;
  sellerId?: string | null;
};

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const PRESET_PRODUCTS = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET_PRODUCTS || process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

async function uploadToCloudinary(file: File): Promise<string> {
  if (!CLOUD_NAME || !PRESET_PRODUCTS) {
    throw new Error("Cloudinary not configured. Check NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_PRESET_PRODUCTS.");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", PRESET_PRODUCTS);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {
    method: "POST",
    body: form,
  });
  const j = await res.json();
  if (!res.ok || !j?.secure_url) throw new Error(j?.error?.message || "Cloudinary upload failed");
  return j.secure_url as string;
}

function toKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "";
  return n.toString();
}

export default function SellPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const editingId = sp.get("id") || "";
  const isEditing = !!editingId;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState<"brand new" | "pre-owned" | "">("");
  const [price, setPrice] = useState<string>("");
  const [image, setImage] = useState<string | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [negotiable, setNegotiable] = useState(false);
  const [uploading, setUploading] = useState<"hero" | "gallery" | null>(null);

  // Load product in edit mode
  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/products/${editingId}`, { cache: "no-store" });
        const j = (await r.json()) as LoadedProduct;
        if (!r.ok) throw new Error((j as any)?.error || `Failed to load (${r.status})`);
        if (cancelled) return;
        setName(j.name || "");
        setDesc(j.description || "");
        setCategory(j.category || "");
        setSubcategory(j.subcategory || "");
        setBrand(j.brand || "");
        setCondition((j.condition as any) || "");
        setPrice(toKES(j.price));
        setImage(j.image || null);
        setGallery(Array.isArray(j.gallery) ? j.gallery : []);
        setLocation(j.location || "");
        setNegotiable(!!j.negotiable);
      } catch (e: any) {
        toast.error(e?.message || "Could not load listing.");
      } finally {
        !cancelled && setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditing, editingId]);

  async function onUpload(input: HTMLInputElement, mode: "hero" | "gallery") {
    const file = input.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast.error("Pick an image file.");
    if (file.size > 4 * 1024 * 1024) return toast.error("Max file size: 4MB");

    setUploading(mode);
    try {
      const url = await uploadToCloudinary(file);
      if (mode === "hero") setImage(url);
      if (mode === "gallery") setGallery((g) => [url, ...g].slice(0, 8));
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(null);
      input.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !category || !subcategory) {
      return toast.error("Name, category and subcategory are required.");
    }
    const payload: ProductPayload = {
      name,
      description: desc || null,
      category,
      subcategory,
      brand: brand || null,
      condition: condition || null,
      price: price ? Math.max(0, Math.round(Number(price))) : null,
      image: image || null,
      gallery,
      location: location || null,
      negotiable,
    };

    setSaving(true);
    try {
      if (isEditing) {
        const r = await fetch(`/api/products/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || (j as any)?.error) throw new Error((j as any)?.error || "Update failed");
        toast.success("Listing updated.");
        router.replace(`/product/${editingId}`);
      } else {
        const r = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || (j as any)?.error || !(j as any)?.id) {
          throw new Error((j as any)?.error || "Create failed");
        }
        toast.success("Listing posted!");
        router.replace(`/product/${(j as any).id}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">
            {isEditing ? "Edit listing" : "Post a listing"}
          </h1>
          <p className="text-sm text-white/80 dark:text-slate-300">
            {isEditing ? "Update your item details." : "Describe your item and add clear photos."}
          </p>
        </div>

        {loading ? (
          <div className="card-surface p-4">Loading…</div>
        ) : (
          <form onSubmit={onSubmit} className="card-surface p-4 space-y-4">
            <div>
              <label className="label">Title</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} required />
              </div>
              <div>
                <label className="label">Subcategory</label>
                <input className="input" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} required />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="label">Brand (optional)</label>
                <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div>
                <label className="label">Condition</label>
                <select className="input" value={condition} onChange={(e) => setCondition(e.target.value as any)}>
                  <option value="">Select…</option>
                  <option value="brand new">Brand new</option>
                  <option value="pre-owned">Pre-owned</option>
                </select>
              </div>
              <div>
                <label className="label">Price (KES)</label>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 12000"
                />
              </div>
            </div>

            <div>
              <label className="label">Description</label>
              <textarea
                className="input min-h-28"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Add condition, accessories, and any defects."
              />
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="label">Location</label>
                <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <label className="label inline-flex items-center gap-2 pt-6 md:pt-8">
                <input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} />
                Negotiable
              </label>
            </div>

            {/* Photos */}
            <div className="space-y-3">
              <div className="font-semibold">Photos</div>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image || "/placeholder/default.jpg"}
                  alt=""
                  className="h-24 w-24 rounded-lg object-cover border"
                />
                <label className="btn-outline cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => onUpload(e.currentTarget, "hero")}
                    disabled={!!uploading}
                  />
                  {uploading === "hero" ? "Uploading…" : "Change main photo"}
                </label>
                {image && (
                  <button type="button" onClick={() => setImage(null)} className="text-red-600 text-sm">
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {gallery.map((g, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <div key={`${g}-${i}`} className="relative">
                    <img src={g} alt="" className="h-20 w-full rounded object-cover border" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 bg-white/90 rounded px-1 text-xs"
                      onClick={() => setGallery((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <label className="h-20 rounded border flex items-center justify-center cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => onUpload(e.currentTarget, "gallery")}
                    disabled={!!uploading}
                  />
                  {uploading === "gallery" ? "…" : "+ Add"}
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving…" : isEditing ? "Save changes" : "Post listing"}
              </button>
              {isEditing ? (
                <Link href={`/product/${editingId}`} className="btn-outline">
                  Cancel
                </Link>
              ) : (
                <Link href="/dashboard" className="btn-outline">
                  Back to dashboard
                </Link>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
