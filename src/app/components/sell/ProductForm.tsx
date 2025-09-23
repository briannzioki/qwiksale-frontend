// src/app/components/sell/ProductForm.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { categoryOptions, subcategoryOptions } from "@/app/data/categories";
import { normalizeMsisdn } from "@/app/data/products";
import { toast } from "react-hot-toast";

type InitialProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price: number | null;
  image: string | null;
  gallery: string[];
  location: string | null;
  condition: string | null;
  negotiable: boolean | null;
  status: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT";
};

type BaseProps = {
  className?: string;
  onCreatedAction?: (id: string) => void | Promise<void>;
  onUpdatedAction?: (id: string) => void | Promise<void>;
};

type CreateProps = BaseProps & {
  mode?: "create";
  productId?: undefined;
  initialValues?: Partial<InitialProduct>;
};

type EditProps = BaseProps & {
  mode: "edit";
  productId: string;
  initialValues: InitialProduct;
};

type Props = CreateProps | EditProps;

const s = (val: unknown, fallback = ""): string =>
  val === null || val === undefined ? fallback : String(val);

type Opt = { value: string; label: string };

export default function ProductForm({ onCreatedAction, className = "" }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categoryOptions()[0]?.value || "");
  const subOptions = useMemo(() => subcategoryOptions(category), [category]);
  const [subcategory, setSubcategory] = useState<string>(subOptions[0]?.value || "");
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState<"brand new" | "pre-owned">("pre-owned");
  const [price, setPrice] = useState<number | "">("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const can =
    name.trim() && category && subcategory && location.trim() && (price === "" || Number(price) >= 0);

  const pickFiles = () => fileInputRef.current?.click();

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(e.target.files || []);
    setFiles(next.slice(0, 10));
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
        // NOTE: swap to your Server Action or API route for real upload
        const payload = {
          name,
          category,
          subcategory,
          brand: brand || null,
          condition,
          price: price === "" ? 0 : Number(price),
          location,
          description,
          phone: msisdn ?? null,
        };

        // placeholder fetch — replace with /api/products (multipart if needed)
        const r = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!r.ok) throw new Error(`Failed (${r.status})`);
        const { id } = (await r.json().catch(() => ({ id: "" }))) as { id?: string };

        toast.success("Listing created");
        (window as any).plausible?.("Listing Created", { props: { category, subcategory } });
        await onCreatedAction?.(id || "");
      } catch (err: any) {
        toast.error(err?.message || (isEdit ? "Failed to save changes" : "Failed to create listing"));
      } finally {
        setBusy(false);
      }
    },
    [busy, brand, category, condition, description, location, name, onCreatedAction, phone, price, subcategory]
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
    >
      <h2 className="text-lg font-bold">Post a Product</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Title */}
        <div>
          <label className="text-sm font-medium">Title</label>
          <input
            id="pf-title"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            required
          />
        </div>

        {/* Brand (optional) */}
        <div>
          <label className="text-sm font-medium">Brand (optional)</label>
          <input
            id="pf-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-sm font-medium">Category</label>
          <select
            id="pf-category"
            value={category}
            onChange={(e) => onChangeCategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {categoryOptions().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Subcategory */}
        <div>
          <label className="text-sm font-medium">Subcategory</label>
          <select
            id="pf-subcategory"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {subOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Condition */}
        <div>
          <label className="text-sm font-medium">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as "brand new" | "pre-owned")}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="brand new">Brand new</option>
            <option value="pre-owned">Pre-owned</option>
          </select>
        </div>

        {/* Price */}
        <div>
          <label className="text-sm font-medium">Price (KES)</label>
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

        {/* Location */}
        <div>
          <label className="text-sm font-medium">Location</label>
          <input
            id="pf-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            required
          />
        </div>

        {/* Phone (optional) */}
        <div>
          <label className="text-sm font-medium">Seller phone (optional)</label>
          <input
            id="pf-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="2547XXXXXXXX"
            inputMode="tel"
          />
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Description</label>
          <textarea
            id="pf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          />
        </div>

        {/* Photos (reusable uploader) */}
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Photos (up to 10)</label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={pickFiles}
              className="rounded-xl px-3 py-2 ring-1 ring-gray-300 dark:ring-gray-700"
            >
              Choose files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={onFiles}
            />
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {files.length ? `${files.length} selected` : "No files selected"}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="submit"
          disabled={!can || busy}
          className={`rounded-xl px-4 py-2 text-white ${!can || busy ? "bg-gray-400" : "bg-[#161748] hover:opacity-90"}`}
        >
          {busy ? (isEdit ? "Saving…" : "Posting…") : isEdit ? "Save changes" : "Post product"}
        </button>
      </div>
    </form>
  );
}
