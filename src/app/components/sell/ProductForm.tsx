// src/app/components/sell/ProductForm.tsx
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { categoryOptions, subcategoryOptions } from "@/app/data/categories";
import { normalizeMsisdn } from "@/app/data/products";
import { toast } from "react-hot-toast";
import { useProducts } from "@/app/lib/productsStore";

type Props = {
  /** Called after a listing is successfully created with the new product ID */
  onCreatedAction?: (id: string) => void | Promise<void>;
  className?: string;
};

export default function ProductForm({ onCreatedAction, className = "" }: Props) {
  // Precompute options once
  const catOpts = useMemo(() => categoryOptions(), []);
  const [category, setCategory] = useState<string>(catOpts[0]?.value || "");

  // Sub-options depend on category
  const subOpts = useMemo(() => subcategoryOptions(category), [category]);

  const [subcategory, setSubcategory] = useState<string>(subOpts[0]?.value || "");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState<"brand new" | "pre-owned">("pre-owned");
  const [price, setPrice] = useState<number | "">("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { addProduct } = useProducts(); // ✅ use cache-aware creation

  // Form readiness
  const can =
    name.trim().length > 0 &&
    category &&
    subcategory &&
    location.trim().length > 0 &&
    (price === "" || Number(price) >= 0);

  const pickFiles = () => fileInputRef.current?.click();

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(e.target.files || []);
    setFiles(next.slice(0, 10));
    // reset so re-picking the same files fires change again
    e.currentTarget.value = "";
  };

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (busy) return;

      const msisdn = normalizeMsisdn(phone);
      if (phone && !msisdn) {
        toast.error("Phone must be Safaricom format (2547XXXXXXXX)");
        return;
      }

      // Gentle nudge if files chosen (this form posts JSON only)
      if (files.length > 0) {
        toast("Heads up: image upload isn’t wired yet — listing will be created without photos.", {
          icon: "📷",
        });
      }

      setBusy(true);
      try {
        // Align with productsStore/addProduct shape
        const payload: Record<string, unknown> = {
          name,
          category,
          subcategory,
          brand: brand || null,
          condition,
          price: price === "" ? null : Number(price),
          location,
          description,
          phone: msisdn ?? null,
          // You can add a 'gallery' later after wiring uploads
        };

        const { id } = await addProduct(payload); // posts to /api/products/create, updates caches

        toast.success("Listing created");
        (window as any).plausible?.("Listing Created", { props: { category, subcategory } });
        await onCreatedAction?.(id);
      } catch (err: any) {
        toast.error(err?.message || "Failed to create listing");
      } finally {
        setBusy(false);
      }
    },
    [
      addProduct,
      brand,
      busy,
      category,
      condition,
      description,
      files.length,
      location,
      name,
      onCreatedAction,
      phone,
      price,
      subcategory,
    ]
  );

  // Keep subcategory coherent if category changes
  const onChangeCategory = useCallback((value: string) => {
    setCategory(value);
    const first = subcategoryOptions(value)[0]?.value || "";
    setSubcategory(first);
  }, []);

  return (
    <form
      onSubmit={submit}
      className={[
        "rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900",
        className,
      ].join(" ")}
      aria-labelledby="sell-form-title"
    >
      <h2 id="sell-form-title" className="text-lg font-bold">
        Post a Product
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="pf-title">
            Title
          </label>
          <input
            id="pf-title"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="pf-brand">
            Brand (optional)
          </label>
          <input
            id="pf-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="pf-category">
            Category
          </label>
          <select
            id="pf-category"
            value={category}
            onChange={(e) => onChangeCategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {catOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="pf-subcategory">
            Subcategory
          </label>
          <select
            id="pf-subcategory"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {subOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="pf-condition">
            Condition
          </label>
          <select
            id="pf-condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value as "brand new" | "pre-owned")}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="brand new">Brand new</option>
            <option value="pre-owned">Pre-owned</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="pf-price">
            Price (KES)
          </label>
          <input
            id="pf-price"
            type="number"
            min={0}
            value={price === "" ? "" : price}
            onChange={(e) => {
              const v = e.target.value;
              setPrice(v === "" ? "" : Math.max(0, Math.floor(Number(v) || 0)));
            }}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="Leave empty for “Contact for price”"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="pf-location">
            Location
          </label>
          <input
            id="pf-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="pf-phone">
            Seller phone (optional)
          </label>
          <input
            id="pf-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="2547XXXXXXXX"
            inputMode="tel"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium" htmlFor="pf-description">
            Description
          </label>
          <textarea
            id="pf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium" htmlFor="pf-files">
            Photos (up to 10)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={pickFiles}
              className="rounded-xl px-3 py-2 ring-1 ring-gray-300 dark:ring-gray-700"
            >
              Choose files
            </button>
            <input
              id="pf-files"
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={onFiles}
            />
            <div className="text-xs text-gray-600 dark:text-gray-400" aria-live="polite">
              {files.length ? `${files.length} selected` : "No files selected"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="submit"
          disabled={!can || busy}
          className={`rounded-xl px-4 py-2 text-white ${
            !can || busy ? "bg-gray-400" : "bg-[#161748] hover:opacity-90"
          }`}
          aria-busy={busy ? "true" : "false"}
        >
          {busy ? "Posting…" : "Post product"}
        </button>
      </div>
    </form>
  );
}
