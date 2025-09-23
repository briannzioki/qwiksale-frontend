// src/app/components/sell/ProductForm.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { categoryOptions, subcategoryOptions } from "@/app/data/categories";
import { normalizeMsisdn } from "@/app/data/products";
import { useProducts } from "@/app/lib/productsStore";
import GalleryUploader from "@/app/components/media/GalleryUploader";

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

export default function ProductForm(props: Props) {
  const { className = "" } = props;
  const isEdit = props.mode === "edit";
  const initial =
    (isEdit
      ? (props as EditProps).initialValues
      : (props as CreateProps).initialValues) ?? undefined;

  const catOpts: Opt[] = useMemo(
    () =>
      (categoryOptions() ?? []).map((o: any) => ({
        value: s(o?.value),
        label: s(o?.label ?? o?.value),
      })),
    []
  );

  const defaultCategory = catOpts[0]?.value ?? "";
  const startCategory = s(initial?.category, defaultCategory);

  const subOptsFor = useCallback(
    (cat: string): Opt[] =>
      (subcategoryOptions(cat) ?? []).map((o: any) => ({
        value: s(o?.value),
        label: s(o?.label ?? o?.value),
      })),
    []
  );

  const firstSubOf = (cat: string) => subOptsFor(cat)[0]?.value ?? "";
  const startSubcategory = s(initial?.subcategory, firstSubOf(startCategory));

  // fields
  const [category, setCategory] = useState<string>(startCategory);
  const [subcategory, setSubcategory] = useState<string>(startSubcategory);
  const [name, setName] = useState<string>(s(initial?.name));
  const [brand, setBrand] = useState<string>("");
  const normalizedCondition =
    initial?.condition === "brand new" || initial?.condition === "pre-owned"
      ? (initial.condition as "brand new" | "pre-owned")
      : ("pre-owned" as const);
  const [condition, setCondition] = useState<"brand new" | "pre-owned">(normalizedCondition);
  const [price, setPrice] = useState<number | "">(
    typeof initial?.price === "number" ? initial.price : ""
  );
  const [location, setLocation] = useState<string>(s(initial?.location));
  const [description, setDescription] = useState<string>(s(initial?.description));
  const [phone, setPhone] = useState<string>("");

  // gallery state + pending local files (to be uploaded on submit)
  const initialGallery = Array.isArray(initial?.gallery)
    ? initial!.gallery.filter(Boolean).map(String)
    : [];
  const [gallery, setGallery] = useState<string[]>(initialGallery);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [busy, setBusy] = useState(false);

  // pull cache-aware actions
  const { addProduct, updateProduct } = useProducts();

  // Keep subcategory valid when category changes
  useEffect(() => {
    if (!category) return;
    const subs = subOptsFor(category);
    const has = subs.some((o) => o.value === subcategory);
    if (!has) setSubcategory(subs[0]?.value ?? "");
  }, [category, subcategory, subOptsFor]);

  const subOpts = useMemo(() => subOptsFor(category), [category, subOptsFor]);

  const canSubmit =
    name.trim().length > 0 &&
    !!category &&
    !!subcategory &&
    location.trim().length > 0 &&
    (price === "" || Number(price) >= 0);

  async function uploadPending(): Promise<string[]> {
    if (pendingFiles.length === 0) return [];
    const uploads = pendingFiles.slice(0, 10).map(async (f) => {
      const fd = new FormData();
      fd.append("file", f);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const uj = (await up.json().catch(() => ({}))) as any;
      if (!up.ok || !(uj?.url || uj?.secure_url)) throw new Error(uj?.error || "Upload failed");
      return String(uj.url || uj.secure_url);
    });
    return Promise.all(uploads);
  }

  const onChangeCategory = useCallback((value: string) => {
    const nextCat = s(value);
    setCategory(nextCat);
    setSubcategory(firstSubOf(nextCat));
  }, []);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (busy) return;

      const msisdn = normalizeMsisdn(phone);
      if (phone && !msisdn) {
        toast.error("Phone must be Safaricom format (2547XXXXXXXX)");
        return;
      }

      setBusy(true);
      try {
        const uploaded = await uploadPending();
        const mergedGallery = [...gallery, ...uploaded].slice(0, 10).map(String);
        const cover = mergedGallery[0] || null;

        const payload: Record<string, unknown> = {
          name: name.trim(),
          category,
          subcategory,
          brand: brand || null,
          condition,
          price: price === "" ? null : Number(price),
          location: location.trim(),
          description: description.trim(),
          phone: msisdn ?? null,
          sellerPhone: msisdn ?? null,
          image: cover,
          gallery: mergedGallery,
          images: mergedGallery,
        };

        if (!isEdit) {
          const { id } = await addProduct(payload);
          toast.success("Listing created");
          (window as any).plausible?.("Listing Created", { props: { category, subcategory } });
          await props.onCreatedAction?.(id);
          setPendingFiles([]);
          return;
        }

        // EDIT: use cache-aware update
        const productId = (props as EditProps).productId;
        await updateProduct(productId, payload);
        toast.success("Changes saved");
        await props.onUpdatedAction?.(productId);
        setPendingFiles([]);
      } catch (err: any) {
        toast.error(err?.message || (isEdit ? "Failed to save changes" : "Failed to create listing"));
      } finally {
        setBusy(false);
      }
    },
    [
      addProduct,
      brand,
      busy,
      category,
      description,
      gallery,
      isEdit,
      location,
      name,
      phone,
      price,
      props,
      subcategory,
      updateProduct,
    ]
  );

  return (
    <form
      onSubmit={submit}
      className={[
        "rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900",
        className,
      ].join(" ")}
      aria-labelledby="sell-form-title"
      noValidate
    >
      <h2 id="sell-form-title" className="text-lg font-bold">
        {isEdit ? "Edit Product" : "Post a Product"}
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Title */}
        <div>
          <label className="text-sm font-medium" htmlFor="pf-title">Title</label>
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
          <label className="text-sm font-medium" htmlFor="pf-brand">Brand (optional)</label>
          <input
            id="pf-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-sm font-medium" htmlFor="pf-category">Category</label>
          <select
            id="pf-category"
            value={category}
            onChange={(e) => onChangeCategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {catOpts.map((o) => (
              <option key={`${o.value}::${o.label}`} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Subcategory */}
        <div>
          <label className="text-sm font-medium" htmlFor="pf-subcategory">Subcategory</label>
          <select
            id="pf-subcategory"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {subOpts.map((o) => (
              <option key={`${o.value}::${o.label}`} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Condition */}
        <div>
          <label className="text-sm font-medium" htmlFor="pf-condition">Condition</label>
          <select
            id="pf-condition"
            value={normalizedCondition}
            onChange={(e) => setCondition(e.target.value as "brand new" | "pre-owned")}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="brand new">Brand new</option>
            <option value="pre-owned">Pre-owned</option>
          </select>
        </div>

        {/* Price */}
        <div>
          <label className="text-sm font-medium" htmlFor="pf-price">Price (KES)</label>
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
          <label className="text-sm font-medium" htmlFor="pf-location">Location</label>
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
          <label className="text-sm font-medium" htmlFor="pf-phone">Seller phone (optional)</label>
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
          <label className="text-sm font-medium" htmlFor="pf-description">Description</label>
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
          <GalleryUploader
            value={gallery}
            onChangeAction={(next) => setGallery(next)}
            onFilesSelectedAction={(files) =>
              setPendingFiles((cur) => [...cur, ...files].slice(0, 10))
            }
            max={10}
          />
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400" aria-live="polite">
            {pendingFiles.length ? `${pendingFiles.length} new selected (to upload on save)` : "No new files selected"}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="submit"
          disabled={!canSubmit || busy}
          className={`rounded-xl px-4 py-2 text-white ${!canSubmit || busy ? "bg-gray-400" : "bg-[#161748] hover:opacity-90"}`}
          aria-busy={busy ? "true" : "false"}
        >
          {busy ? (isEdit ? "Saving…" : "Posting…") : isEdit ? "Save changes" : "Post product"}
        </button>
      </div>
    </form>
  );
}
