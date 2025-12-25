"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { categories, type CategoryNode } from "@/app/lib/categories";
import { useProducts } from "@/app/lib/productsStore";
import GalleryUploader from "@/app/components/media/GalleryUploader";
import { normalizeKenyanPhone, validateKenyanPhone } from "@/app/lib/phone";

type InitialProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price: number | null;
  image: string | null;
  gallery: string[] | null;
  images?: string[] | null;
  brand?: string | null;
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

// ✅ Public guard (matches client page)
const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";

/* ----------------------------- Money helper ----------------------------- */
function fmtKES(n: number) {
  try {
    return new Intl.NumberFormat("en-KE").format(n);
  } catch {
    return n.toString();
  }
}

export default function ProductForm(props: Props) {
  const { className = "" } = props;
  const isEdit = props.mode === "edit";
  const initial =
    (isEdit ? (props as EditProps).initialValues : (props as CreateProps).initialValues) ??
    undefined;

  // Categories (same helper as edit page), now from central lib
  const cats: readonly CategoryNode[] = categories;

  const defaultCategory = cats[0]?.name ?? "";
  const startCategory = s(initial?.category, defaultCategory);
  const startSubcategory = s(
    initial?.subcategory,
    (cats.find((c) => c.name === startCategory)?.subcategories ?? [])[0]?.name ?? "",
  );

  // fields (consistent defaults/order with edit page)
  const [name, setName] = useState<string>(s(initial?.name));
  const [price, setPrice] = useState<number | "">(
    typeof initial?.price === "number" ? initial.price : "",
  );
  const [negotiable, setNegotiable] = useState<boolean>(Boolean(initial?.negotiable));
  const normalizedCondition =
    initial?.condition === "brand new" || initial?.condition === "pre-owned"
      ? (initial.condition as "brand new" | "pre-owned")
      : ("brand new" as const);
  const [condition, setCondition] = useState<"brand new" | "pre-owned">(normalizedCondition);

  const [category, setCategory] = useState<string>(startCategory);
  const [subcategory, setSubcategory] = useState<string>(startSubcategory);

  const [brand, setBrand] = useState<string>(s((initial as any)?.brand));
  const [location, setLocation] = useState<string>(s(initial?.location) || "Nairobi");
  const [phone, setPhone] = useState<string>("");
  const [description, setDescription] = useState<string>(s(initial?.description));

  // gallery state + pending local files (to be uploaded on submit)
  const initialGallery: string[] =
    Array.isArray(initial?.gallery) && initial?.gallery?.length
      ? (initial!.gallery as string[]).filter(Boolean).map(String)
      : Array.isArray((initial as any)?.images)
        ? ((initial as any).images as string[]).filter(Boolean).map(String)
        : [];
  const [gallery, setGallery] = useState<string[]>(initialGallery);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [busy, setBusy] = useState(false);

  // cache-aware actions
  const { addProduct, updateProduct } = useProducts();

  // Keep subcategory valid when category changes
  useEffect(() => {
    if (!category) return;
    const subs = (cats.find((c) => c.name === category)?.subcategories ?? []).map((s) => s.name);
    const has = subs.includes(subcategory);
    if (!has) setSubcategory(subs[0] ?? "");
  }, [category, subcategory, cats]);

  const subcats = useMemo(
    () => (cats.find((c) => c.name === category)?.subcategories ?? []).map((s) => s.name),
    [category, cats],
  );

  // Phone helpers (same as edit page)
  const phoneValidation = phone ? validateKenyanPhone(phone) : { ok: true as const };
  const normalizedPhone = phone ? normalizeKenyanPhone(phone) ?? "" : "";
  const phoneOk = !phone || phoneValidation.ok;

  const priceNum = typeof price === "number" ? price : 0;

  const canSubmit =
    name.trim().length >= 3 &&
    !!category &&
    !!subcategory &&
    description.trim().length >= 10 &&
    (price === "" || Number(price) >= 0) &&
    phoneOk;

  async function uploadPending(): Promise<string[]> {
    if (pendingFiles.length === 0) return [];
    const uploads = pendingFiles.slice(0, 6).map(async (f) => {
      const fd = new FormData();
      fd.append("file", f);
      const up = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      const uj = (await up.json().catch(() => ({}))) as any;
      if (!up.ok || !(uj?.url || uj?.secure_url)) throw new Error(uj?.error || "Upload failed");
      return String(uj?.url || uj?.secure_url);
    });
    return Promise.all(uploads);
  }

  const onChangeCategory = useCallback(
    (value: string) => {
      const nextCat = s(value);
      setCategory(nextCat);
      const first = (cats.find((c) => c.name === nextCat)?.subcategories ?? [])[0]?.name ?? "";
      setSubcategory(first);
    },
    [cats],
  );

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (busy) return;

      if (phone && !phoneOk) {
        toast.error("Please enter a valid Kenyan mobile.");
        return;
      }

      // ✅ Guard: avoid trying to upload if image uploads aren’t configured
      if (pendingFiles.length > 0 && !CLOUD_NAME) {
        toast.error(
          "Image uploads are not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (and optionally NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET).",
        );
        return;
      }

      setBusy(true);
      try {
        const uploaded = await uploadPending();
        const mergedGallery = [...gallery, ...uploaded].slice(0, 6).map(String);
        const cover = mergedGallery[0] || null;

        const msisdn = normalizedPhone || null;

        const payload: Record<string, unknown> = {
          name: name.trim(),
          category,
          subcategory,
          brand: brand || null,
          condition,
          price: price === "" ? null : Number(price),
          location: location.trim(),
          description: description.trim(),
          negotiable,
          sellerPhone: msisdn ?? null,
          // keep backwards compat with any consumers expecting `phone`
          phone: msisdn ?? null,
          image: cover,
          gallery: mergedGallery,
          images: mergedGallery,
        };

        if (!isEdit) {
          const created = await addProduct(payload);
          const newId =
            typeof created === "string"
              ? created
              : created && typeof created === "object" && "id" in created
                ? String((created as any).id)
                : undefined;
          if (!newId) throw new Error("Create failed: no id returned");

          toast.success("Listing created");
          (window as any).plausible?.("Listing Created", {
            props: {
              category,
              subcategory,
            },
          });
          await props.onCreatedAction?.(newId);
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
        toast.error(
          err?.message || (isEdit ? "Failed to save changes" : "Failed to create listing"),
        );
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
      negotiable,
      normalizedPhone,
      pendingFiles.length,
      phone,
      phoneOk,
      price,
      props,
      subcategory,
      updateProduct,
    ],
  );

  return (
    <form
      onSubmit={submit}
      className={[
        "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 shadow-soft sm:p-5",
        className,
      ].join(" ")}
      aria-labelledby="sell-form-title"
      noValidate
    >
      <h2
        id="sell-form-title"
        className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg"
      >
        {isEdit ? "Edit Product" : "Post a Product"}
      </h2>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:mt-4 sm:gap-6">
        {/* Title & Price (match edit page grouping) */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3 md:gap-6">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="pf-title">
              Title
            </label>
            <input
              id="pf-title"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
              required
              minLength={3}
              placeholder="e.g. iPhone 13 Pro 256GB"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="pf-price">
              Price (KES)
            </label>
            <input
              id="pf-price"
              type="number"
              min={0}
              inputMode="numeric"
              value={price === "" ? "" : price}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setPrice(v === "" ? "" : Math.max(0, Math.floor(Number(v) || 0)));
              }}
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
              placeholder='Leave empty for "Contact for price"'
              aria-describedby="pf-price-help"
            />
            <p
              id="pf-price-help"
              className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs"
            >
              Leave empty to show <em className="text-[var(--text)]">Contact for price</em>.
            </p>

            <div className="mt-2 flex items-center gap-2">
              <input
                id="pf-negotiable"
                type="checkbox"
                className="rounded border-[var(--border)] bg-[var(--bg)]"
                checked={negotiable}
                onChange={(e) => setNegotiable(e.currentTarget.checked)}
              />
              <label htmlFor="pf-negotiable" className="text-sm text-[var(--text-muted)]">
                Negotiable price
              </label>
            </div>

            {typeof price === "number" && price > 0 && (
              <div className="mt-1 text-[11px] text-[var(--text-muted)] sm:text-xs">
                You entered: <span className="text-[var(--text)]">KES {fmtKES(priceNum)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Condition, Category, Subcategory (same order as edit page) */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3 md:gap-6">
          <div>
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="pf-condition">
              Condition
            </label>
            <select
              id="pf-condition"
              value={condition}
              onChange={(e) => setCondition(e.currentTarget.value as "brand new" | "pre-owned")}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              <option value="brand new">Brand new</option>
              <option value="pre-owned">Pre-owned</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="pf-category">
              Category
            </label>
            <select
              id="pf-category"
              value={category}
              onChange={(e) => onChangeCategory(e.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              {cats.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="pf-subcategory">
              Subcategory
            </label>
            <select
              id="pf-subcategory"
              value={subcategory}
              onChange={(e) => setSubcategory(e.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              {subcats.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Brand, Location, Phone (same order) */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3 md:gap-6">
          <div>
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="pf-brand">
              Brand (optional)
            </label>
            <input
              id="pf-brand"
              value={brand}
              onChange={(e) => setBrand(e.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
              placeholder="e.g. Samsung"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="pf-location">
              Location
            </label>
            <input
              id="pf-location"
              value={location}
              onChange={(e) => setLocation(e.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
              placeholder="e.g. Nairobi"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="pf-phone">
              Phone (WhatsApp, optional)
            </label>
            <input
              id="pf-phone"
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
              placeholder="07XXXXXXXX or +2547XXXXXXXX"
              inputMode="tel"
              aria-invalid={!!phone && !phoneOk}
              aria-describedby="pf-phone-help"
            />
            <div
              id="pf-phone-help"
              className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs"
            >
              {phone ? (
                phoneOk ? (
                  <>
                    Normalized:{" "}
                    <code className="font-mono text-[var(--text)]">{normalizedPhone}</code>
                  </>
                ) : (
                  "Please enter a valid Kenyan mobile."
                )
              ) : (
                "Optional. Buyers can call or WhatsApp."
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-[var(--text)]" htmlFor="pf-description">
            Description
          </label>
          <textarea
            id="pf-description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            rows={5}
            className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
            placeholder="Describe the item, condition, accessories, warranty, etc."
            required
            minLength={10}
          />
        </div>

        {/* Photos (reusable uploader) */}
        <div className="md:col-span-2">
          <GalleryUploader
            value={gallery}
            onChangeAction={(next) => setGallery(next)}
            onFilesSelectedAction={(files) =>
              setPendingFiles((cur) => [...cur, ...files].slice(0, 6))
            }
            max={6}
            accept="image/*,.jpg,.jpeg,.png,.webp"
            maxSizeMB={10}
          />
          <div className="mt-1 text-[11px] text-[var(--text-muted)] sm:mt-2 sm:text-xs" aria-live="polite">
            {pendingFiles.length
              ? `${pendingFiles.length} new selected (to upload on save)`
              : "No new files selected"}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex justify-end gap-2 sm:mt-5">
        <button
          type="submit"
          disabled={!canSubmit || busy}
          className={[
            "min-h-[44px] rounded-xl px-4 py-2.5 text-xs font-semibold text-[var(--text)] transition sm:text-sm",
            "border border-[var(--border-subtle)] bg-[var(--bg)] hover:bg-[var(--bg-subtle)]",
            "focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99]",
            !canSubmit || busy ? "opacity-60 cursor-not-allowed" : "",
          ].join(" ")}
          aria-busy={busy ? "true" : "false"}
          data-testid="product-form-submit"
        >
          {busy ? (isEdit ? "Saving…" : "Posting…") : isEdit ? "Save changes" : "Post product"}
        </button>
      </div>
    </form>
  );
}
