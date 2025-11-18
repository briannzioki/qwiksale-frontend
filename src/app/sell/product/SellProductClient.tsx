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
import Link from "next/link";
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
type Me = {
  id: string;
  email: string | null;
  profileComplete?: boolean;
  whatsapp?: string | null;
};

type Props = {
  id?: string | undefined;
  hideMedia?: boolean;
  onBeforeSubmitAction?: () => Promise<void>;
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

  const sigRes = await fetch(
    `/api/upload/sign?folder=${encodeURIComponent(folder)}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  const sigJson: any = await sigRes.json();
  if (!sigRes.ok)
    throw new Error(sigJson?.error || "Failed to get upload signature");

  fd.append("api_key", sigJson.apiKey);
  fd.append("timestamp", String(sigJson.timestamp));
  fd.append("signature", sigJson.signature);
  fd.append("folder", folder);

  const xhr = new XMLHttpRequest();
  const p = new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && opts?.onProgress) {
          opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          try {
            const j = JSON.parse(xhr.responseText);
            if (
              xhr.status >= 200 &&
              xhr.status < 300 &&
              j.secure_url
            ) {
              resolve({ secure_url: j.secure_url, public_id: j.public_id });
            } else {
              reject(
                new Error(
                  j?.error?.message ||
                    `Cloudinary upload failed (${xhr.status})`,
                ),
              );
            }
          } catch (e: any) {
            reject(
              new Error(e?.message || "Cloudinary response parse error"),
            );
          }
        }
      };
      xhr.open("POST", endpoint, true);
      xhr.send(fd);
    },
  );
  return p;
}

export default function SellProductClient({
  id,
  hideMedia = false,
  onBeforeSubmitAction,
}: Props) {
  const router = useRouter();

  // We no longer gate rendering on "ready" – the form is always rendered
  const [allowed, setAllowed] = useState<boolean | null>(null);

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

  // Auth & /api/me – used for prefill and sign-in hint only, never to hide the form
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });

        if (res.status === 401) {
          if (!cancelled) {
            setAllowed(false);
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setAllowed(true);
          }
          return;
        }

        const j = (await res.json().catch(() => null)) as any;
        const me: Me | null = (j && (j.user ?? j)) || null;

        if (!cancelled && me && me.profileComplete === false) {
          setAllowed(true);
          return;
        }

        if (!cancelled && !phone && me?.whatsapp) setPhone(me.whatsapp);
        if (!cancelled) setAllowed(true);
      } catch {
        if (!cancelled) setAllowed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phone]);

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
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to prefill product.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

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
      )
        continue;
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
        if (computedGallery && computedGallery.length > 0)
          payload["gallery"] = computedGallery;
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

  const notSignedIn = allowed === false;

  return (
    // Full client-side flow; no mount-time URL normalization, and form is always rendered.
    <div className="container-page py-6">
      {/* Optional inline sign-in warning, but we ALWAYS render the form + CTA */}
      {notSignedIn && (
        <div className="mb-4 rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold">You’re not signed in</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
            You can draft your listing, but you’ll need to sign in before it can
            be posted.
          </p>
          <div className="mt-2">
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent(
                "/sell/product",
              )}`}
              className="btn-gradient-primary inline-block text-sm"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      {/* Header card */}
      <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
        <h1 className="text-2xl font-bold text-balance">
          {id ? "Edit Product" : "Post a Product"}
        </h1>
        <p className="text-white/90">
          {id
            ? "Update your listing details."
            : "List your item — it takes less than 2 minutes."}
        </p>
      </div>

      {/* Form */}
      <form
        className="mt-6 space-y-4 rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        onSubmit={onSubmit}
      >
        {/* Basic fields */}
        <div>
          <label className="label">
            Name
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={3}
              required
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="label">
            Category
            <select
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
          </label>
          <label className="label">
            Subcategory
            <select
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
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="label">
            Price (KES)
            <input
              className="input mt-1"
              inputMode="numeric"
              value={price === "" ? "" : String(price)}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setPrice(v === "" ? "" : Number(v));
              }}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Leave blank for “Contact for price”.
            </p>
          </label>
          <label className="label">
            Negotiable
            <input
              type="checkbox"
              className="ml-2 h-4 w-4 rounded border-gray-300 text-brandNavy"
              checked={negotiable}
              onChange={(e) => setNegotiable(e.target.checked)}
            />
          </label>
          <label className="label">
            Condition
            <select
              className="select mt-1"
              value={condition}
              onChange={(e) =>
                setCondition(e.target.value as "brand new" | "pre-owned")
              }
            >
              <option value="brand new">Brand New</option>
              <option value="pre-owned">Pre-Owned</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="label">
            Brand (optional)
            <input
              className="input mt-1"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </label>
          <label className="label">
            Location
            <input
              className="input mt-1"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
        </div>

        <label className="label">
          WhatsApp / Phone
          <input
            className="input mt-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07XXXXXXXX / 2547XXXXXXXX"
          />
          {!phoneOk && (
            <p className="mt-1 text-xs text-red-600">
              Enter a valid Kenyan phone number.
            </p>
          )}
        </label>

        <label className="label">
          Description
          <textarea
            className="textarea mt-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minLength={10}
            required
          />
        </label>

        {/* Media */}
        {!hideMedia && (
          <section className="space-y-3">
            <div
              className="rounded-lg border border-dashed p-4 text-sm text-gray-600 dark:border-slate-700 dark:text-slate-300"
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
                <div className="rounded border p-2 text-xs">
                  Existing cover image
                </div>
              )}
              {existingGallery.map((url) => (
                <div
                  key={url}
                  className="rounded border p-2 text-xs"
                >
                  Existing photo
                </div>
              ))}
              {previews.map((p, idx) => (
                <div
                  key={p.key}
                  className="space-y-1 rounded border p-2 text-xs"
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
                        className="rounded border px-1"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, 1)}
                        className="rounded border px-1"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAt(idx)}
                        className="rounded border px-1 text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {uploadPct > 0 && submitting && (
              <div className="text-xs text-gray-600 dark:text-slate-300">
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
          >
            {submitting
              ? id
                ? "Updating…"
                : "Posting…"
              : id
              ? "Update listing"
              : "Post listing"}
          </button>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            You can edit this listing later from your dashboard.
          </p>
        </div>
      </form>
    </div>
  );
}
