// src/app/sell/product/SellProductClient.tsx
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { categories, type CategoryNode } from "@/app/data/categories";
import { useProducts } from "@/app/lib/productsStore";
import { toast } from "@/app/components/ToasterClient";
import {
  normalizeKenyanPhone,
  validateKenyanPhone,
} from "@/app/lib/phone";
import { extractGalleryUrls } from "@/app/lib/media";

type FilePreview = { file: File; url: string; key: string };

type Props = {
  id?: string | undefined;
  hideMedia?: boolean;
  onBeforeSubmitAction?: () => Promise<void>;
  /**
   * Server-computed flag from /sell/product/page.tsx.
   * We do NOT call /api/me to decide login state.
   */
  isAuthenticated?: boolean;
};

const MAX_FILES = 6;
const MAX_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";
const UPLOAD_PRESET =
  process.env["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"] ?? "";

function fmtKES(n: number) {
  try {
    return new Intl.NumberFormat("en-KE").format(n);
  } catch {
    return n.toString();
  }
}

async function uploadToCloudinary(
  file: File,
  opts?: { onProgress?: (pct: number) => void; folder?: string },
): Promise<{ secure_url: string; public_id: string }> {
  if (!CLOUD_NAME) {
    throw new Error("Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  }

  if (!UPLOAD_PRESET) {
    throw new Error(
      "Missing NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET — required for unsigned uploads"
    );
  }

  const folder = opts?.folder || "qwiksale";
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);
  fd.append("folder", folder);

  const res = await fetch(endpoint, {
    method: "POST",
    body: fd,
  });

  const json: any = await res.json();

  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message || "Cloudinary upload failed");
  }

  return {
    secure_url: json.secure_url,
    public_id: json.public_id,
  };
}

export default function SellProductClient({
  id,
  hideMedia = false,
  onBeforeSubmitAction,
  isAuthenticated = false,
}: Props) {
  const router = useRouter();

  const [name, setName] = useState<string>("");
  const [price, setPrice] = useState<number | "">("");
  const [negotiable, setNegotiable] = useState<boolean>(false);
  const [condition, setCondition] = useState<"brand new" | "pre-owned">(
    "brand new",
  );

  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");

  const [brand, setBrand] = useState<string>("");
  const [location, setLocation] = useState<string>("Nairobi");
  const [phone, setPhone] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [existingGallery, setExistingGallery] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadPct, setUploadPct] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const store = useProducts() as any;
  const addProduct: (payload: any) => Promise<any> | any =
    store && typeof store.addProduct === "function"
      ? store.addProduct
      : async () => undefined;

  const cats: readonly CategoryNode[] = categories;

  const subcats: readonly { name: string }[] = useMemo(() => {
    const found = cats.find((c) => c.name === category);
    return (found?.subcategories ?? []).map((s) => ({ name: s.name }));
  }, [cats, category]);

  // Default category/subcategory selection
  useEffect(() => {
    if (!category) {
      const first = cats[0];
      if (first) setCategory(first.name);
    }
  }, [category, cats]);

  useEffect(() => {
    if (!subcats.length) {
      setSubcategory("");
      return;
    }
    if (!subcats.some((s) => s.name === subcategory)) {
      const firstSub = subcats[0];
      setSubcategory(firstSub ? firstSub.name : "");
    }
  }, [subcats, subcategory]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const phoneValidation = phone
    ? validateKenyanPhone(phone)
    : { ok: true as const };
  const normalizedPhone = phone ? normalizeKenyanPhone(phone) ?? "" : "";
  const phoneOk = !phone || phoneValidation.ok;

  const priceNum = price === "" ? 0 : Number(price);

  const canSubmit =
    name.trim().length >= 3 &&
    !!category &&
    !!subcategory &&
    description.trim().length >= 10 &&
    (price === "" || (typeof price === "number" && price >= 0)) &&
    phoneOk;

  /* --------------------------- EDIT PREFILL LOGIC --------------------------- */
  // Track whether prefill succeeded so we can avoid showing misleading guest copy
  const [prefilled, setPrefilled] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch(
          `/api/products/${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        if (!r.ok) {
          toast.error("Unable to load product for editing.");
          return;
        }
        const p: any = await r.json();

        if (cancelled) return;

        setName(p?.name ?? "");
        setDescription(p?.description ?? "");
        setCategory(p?.category ?? "");
        setSubcategory(p?.subcategory ?? "");
        setBrand(p?.brand ?? "");
        setCondition(
          (String(p?.condition || "")
            .toLowerCase()
            .includes("brand")
            ? "brand new"
            : "pre-owned") as "brand new" | "pre-owned",
        );
        setPrice(typeof p?.price === "number" ? p.price : "");
        setNegotiable(Boolean(p?.negotiable));
        setLocation(p?.location ?? p?.sellerLocation ?? "Nairobi");
        setPhone(p?.sellerPhone ?? "");

        setExistingImage(p?.image ?? null);

        const normalized = extractGalleryUrls(
          { gallery: p?.gallery },
          undefined,
          50,
        );
        setExistingGallery(normalized);

        // mark successful prefill so we don't show generic "You're not signed in"
        setPrefilled(true);
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to prefill product.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  /* ---------------------------- FILE HANDLING ---------------------------- */

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
      if (
        previews.some((p) => p.key === key) ||
        next.some((p) => p.key === key)
      ) {
        continue;
      }
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (!hideMedia && previews.length && !CLOUD_NAME) {
      toast.error(
        "Image uploads are not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (and optionally NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET).",
      );
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setUploadPct(0);

    try {
      if (onBeforeSubmitAction) {
        await onBeforeSubmitAction();
      }

      let uploaded: { secure_url: string; public_id: string }[] = [];
      if (!hideMedia && previews.length) {
        const total = previews.length;
        let done = 0;

        for (const p of previews) {
          const item = await uploadToCloudinary(p.file, {
            folder: "qwiksale/products",
            onProgress: (pct) => {
              const overall = Math.round(
                ((done + pct / 100) / total) * 100,
              );
              setUploadPct(overall);
            },
          });
          uploaded.push(item);
          done += 1;
          setUploadPct(Math.round((done / total) * 100));
        }
      }

      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        category,
        subcategory,
        brand: brand || undefined,
        condition,
        price:
          price === "" ? undefined : Math.max(0, Math.round(Number(price))),
        location: location.trim(),
        negotiable,
        sellerPhone: normalizedPhone || undefined,
      };

      if (!hideMedia) {
        const computedImage =
          uploaded[0]?.secure_url ??
          previews[0]?.url ??
          existingImage ??
          undefined;

        const computedGallery: string[] =
          uploaded.length
            ? uploaded.map((u) => u.secure_url)
            : previews.length
            ? previews.map((p) => p.url)
            : existingGallery?.length
            ? existingGallery
            : [];

        if (computedImage) payload["image"] = computedImage;
        if (computedGallery && computedGallery.length > 0) {
          payload["gallery"] = computedGallery;
        }
      }

      let resultId: string | null = null;

      if (id) {
        const r = await fetch(
          `/api/products/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify(payload),
          },
        );
        const j = await r.json().catch(() => ({} as any));
        if (!r.ok || (j as any)?.error) {
          throw new Error(
            (j as any)?.error || `Failed to update (${r.status})`,
          );
        }
        resultId = id;
        toast.success("Product updated!");
      } else {
        let created: any = await addProduct(payload);

        if (!created) {
          const r = await fetch("/api/products/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify(payload),
          });
          const j = await r.json().catch(() => ({} as any));
          if (!r.ok || (j as any)?.error) {
            throw new Error(
              (j as any)?.error || `Failed to create (${r.status})`,
            );
          }
          created = { id: (j as any).productId };
        }

        resultId =
          typeof created === "string"
            ? created
            : created &&
              typeof created === "object" &&
              "id" in created
            ? String((created as any).id)
            : null;

        toast.success("Product posted!");
      }

      // Single navigation after a deliberate user action only.
      if (resultId) {
        router.replace(`/product/${resultId}/edit`);
      } else {
        router.replace("/sell/product");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.message ||
          (id
            ? "Failed to update product."
            : "Failed to post product."),
      );
    } finally {
      setSubmitting(false);
      setUploadPct(0);
    }
  }

  // Only show generic "You're not signed in" when server said unauthenticated
  // AND we do not have a successful edit prefill.
  const notSignedIn = !isAuthenticated && !(id && prefilled);

  return (
    <div
      className="container-page py-6"
      data-authed={isAuthenticated ? "true" : "false"}
    >
      {notSignedIn && (
        <div className="mb-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            You’re not signed in
          </h2>
          <p className="mt-2 text-muted-foreground">
            You can sketch out your product, but you’ll need to sign in
            before publishing.
          </p>
          <div className="mt-4">
            <a
              href={`/signin?callbackUrl=${encodeURIComponent(
                "/sell/product",
              )}`}
              className="btn-gradient-primary inline-block"
            >
              Sign in
            </a>
          </div>
        </div>
      )}

      {/* Header card (single heading for Playwright strict mode) */}
      <div className="rounded-xl bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue p-5 text-white shadow-soft">
        <h1
          id="sell-form-title"
          className="text-2xl font-bold text-balance"
        >
          {id ? "Edit Product" : "Post a Product"}
        </h1>
        <p className="text-white/90">
          {id
            ? "Update your listing details."
            : "List your item — it takes less than 2 minutes."}
        </p>
      </div>

      {/* Deterministic CTAs for tests: always expose both links */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href="/sell/product"
          className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent"
        >
          Create New
        </a>
        <a
          href={`/signin?callbackUrl=${encodeURIComponent(
            "/sell/product",
          )}`}
          className="inline-flex items-center text-sm font-medium text-brandNavy underline-offset-2 hover:underline"
        >
          Sign in
        </a>
      </div>

      {/* Form */}
      <form
        className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby="sell-form-title"
        onSubmit={onSubmit}
      >
        {/* Basic fields */}
        <div>
          <label className="label" htmlFor="pf-title">
            Title
          </label>
          <input
            id="pf-title"
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={3}
            required
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="pf-category">
              Category
            </label>
            <select
              id="pf-category"
              className="select mt-1"
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
            <label className="label" htmlFor="pf-subcategory">
              Subcategory
            </label>
            <select
              id="pf-subcategory"
              className="select mt-1"
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

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="pf-price">
              Price (KES)
            </label>
            <input
              id="pf-price"
              className="input mt-1"
              inputMode="numeric"
              aria-describedby="pf-price-help"
              value={price === "" ? "" : String(price)}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setPrice(v === "" ? "" : Number(v));
              }}
            />
            <p
              id="pf-price-help"
              className="mt-1 text-xs text-muted-foreground"
            >
              Leave blank for “Contact for price”.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-6 md:pt-8">
            <input
              type="checkbox"
              id="pf-negotiable"
              className="h-4 w-4 rounded border border-border text-brandNavy"
              checked={negotiable}
              onChange={(e) => setNegotiable(e.target.checked)}
            />
            <label className="label mb-0" htmlFor="pf-negotiable">
              Negotiable
            </label>
          </div>

          <div>
            <label className="label" htmlFor="pf-condition">
              Condition
            </label>
            <select
              id="pf-condition"
              name="condition"
              className="select mt-1"
              value={condition}
              onChange={(e) =>
                setCondition(
                  e.target.value as "brand new" | "pre-owned",
                )
              }
            >
              <option value="brand new">Brand New</option>
              <option value="pre-owned">Pre-Owned</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="pf-brand">
              Brand (optional)
            </label>
            <input
              id="pf-brand"
              className="input mt-1"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="pf-location">
              Location
            </label>
            <input
              id="pf-location"
              className="input mt-1"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="pf-phone">
            Phone (WhatsApp, optional)
          </label>
          <input
            id="pf-phone"
            className="input mt-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="07XXXXXXXX / 2547XXXXXXXX"
          />
          {!phoneOk && (
            <p className="mt-1 text-xs text-red-600">
              Enter a valid Kenyan phone number.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="pf-description">
            Description
          </label>
          <textarea
            id="pf-description"
            className="textarea mt-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minLength={10}
            required
          />
        </div>

        {/* Media */}
        {!hideMedia && (
          <section className="space-y-3">
            <div
              className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
              onDrop={onDrop}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <p className="font-medium">Photos</p>
              <p className="text-xs">
                Drag & drop up to {MAX_FILES} images ({MAX_MB}MB each), or
                click to select.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                multiple
                className="mt-2 block text-xs"
                onChange={(e) => onFileInputChange(e.target.files)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {existingImage && existingGallery.length === 0 && (
                <div className="rounded border border-border p-2 text-xs">
                  Existing cover image
                </div>
              )}
              {existingGallery.map((url) => (
                <div
                  key={url}
                  className="rounded border border-border p-2 text-xs"
                >
                  Existing photo
                </div>
              ))}
              {previews.map((p, idx) => (
                <div
                  key={p.key}
                  className="space-y-1 rounded border border-border p-2 text-xs"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt=""
                    className="h-24 w-full rounded object-cover"
                  />
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">
                      {fmtKES(p.file.size / 1024)} KB
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => move(idx, -1)}
                        className="rounded border border-border px-1"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, 1)}
                        className="rounded border border-border px-1"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAt(idx)}
                        className="rounded border border-border px-1 text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {previews.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No new files selected
              </p>
            )}

            {uploadPct > 0 && submitting && (
              <div className="text-xs text-muted-foreground">
                Uploading photos… {uploadPct}%
              </div>
            )}
          </section>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="btn-gradient-primary"
            data-testid="product-form-submit"
          >
            {submitting
              ? id
                ? "Updating…"
                : "Posting…"
              : id
              ? "Update listing"
              : "Post listing"}
          </button>
          <p className="text-xs text-muted-foreground">
            You can edit this listing later from your dashboard.
          </p>
        </div>
      </form>
    </div>
  );
}
