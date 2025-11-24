// src/app/sell/service/SellServiceClient.tsx
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
import { toast } from "@/app/components/ToasterClient";
import { extractGalleryUrls } from "@/app/lib/media";

const SERVICE_CATEGORIES = [
  {
    name: "Home Services",
    subcategories: [{ name: "Cleaning" }, { name: "Repairs" }],
  },
  {
    name: "Automotive",
    subcategories: [{ name: "Mechanic" }, { name: "Car Wash" }],
  },
  {
    name: "Events",
    subcategories: [{ name: "Photography" }, { name: "Catering" }],
  },
] as const;

type FilePreview = { file: File; url: string; key: string };

type Props = {
  editId?: string | null | undefined;
  hideMedia?: boolean;
  onBeforeSubmitAction?: () => Promise<void>;
  /**
   * Server-computed auth hint from /sell/service/page.tsx.
   * We never call /api/me to decide if you are logged in.
   */
  isAuthenticated?: boolean;
};

const MAX_FILES = 6;
const MAX_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";
const UPLOAD_PRESET =
  process.env["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"] ?? "";

function normalizePhone(raw: string): string {
  const trimmed = (raw || "").trim();
  if (/^\+254(7|1)\d{8}$/.test(trimmed)) return trimmed.replace(/^\+/, "");
  let s = trimmed.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}
const looksLikeValidKePhone = (input: string) =>
  /^254(7|1)\d{8}$/.test(normalizePhone(input));

async function uploadToCloudinary(
  file: File,
  opts?: { onProgress?: (pct: number) => void; folder?: string },
): Promise<{ secure_url: string; public_id: string }> {
  if (!CLOUD_NAME) {
    throw new Error("Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  }
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
  if (!sigRes.ok) {
    throw new Error(sigJson?.error || "Failed to get upload signature");
  }

  const xhr = new XMLHttpRequest();
  return await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && opts?.onProgress) {
          opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) return;
        try {
          const j = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && j.secure_url) {
            resolve({
              secure_url: j.secure_url,
              public_id: j.public_id,
            });
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
            new Error(
              e?.message || "Cloudinary response parse error",
            ),
          );
        }
      };
      xhr.open("POST", endpoint, true);
      xhr.send(fd);
    },
  );
}

export default function SellServiceClient({
  editId,
  hideMedia = false,
  onBeforeSubmitAction,
  isAuthenticated = false,
}: Props) {
  const router = useRouter();

  const [name, setName] = useState<string>("");
  const [price, setPrice] = useState<number | "">("");
  const [rateType, setRateType] = useState<"hour" | "day" | "fixed">(
    "fixed",
  );
  const [category, setCategory] = useState<string>(
    String(SERVICE_CATEGORIES[0]?.name || "Services"),
  );
  const [subcategory, setSubcategory] = useState<string>(
    String(SERVICE_CATEGORIES[0]?.subcategories?.[0]?.name || ""),
  );
  const [serviceArea, setServiceArea] = useState<string>("Nairobi");
  const [availability, setAvailability] = useState<string>("Weekdays");
  const [location, setLocation] = useState<string>("Nairobi");
  const [phone, setPhone] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [existingGallery, setExistingGallery] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadPct, setUploadPct] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Edit prefill
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/services/${encodeURIComponent(editId)}`,
          {
            cache: "no-store",
          },
        );
        if (!r.ok) {
          toast.error("Unable to load service for editing.");
          return;
        }
        const s: any = await r.json();
        if (cancelled) return;

        setName(s?.name ?? "");
        setDescription(s?.description ?? "");
        setCategory(s?.category ?? "Services");
        setSubcategory(s?.subcategory ?? "");
        setRateType(
          (s?.rateType as "hour" | "day" | "fixed") ?? "fixed",
        );
        setPrice(
          typeof s?.price === "number"
            ? s.price
            : s?.price === null
            ? ""
            : "",
        );
        setServiceArea(
          s?.serviceArea ?? s?.location ?? "Nairobi",
        );
        setAvailability(s?.availability ?? "Weekdays");
        setLocation(
          s?.location ?? s?.serviceArea ?? "Nairobi",
        );
        setPhone(s?.sellerPhone ?? "");
        setExistingImage(s?.image ?? null);
        setExistingGallery(
          extractGalleryUrls(
            { gallery: s?.gallery },
            undefined,
            50,
          ),
        );
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to prefill service.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  type Sub = { readonly name: string };
  type Cat = {
    readonly name: string;
    readonly subcategories: readonly Sub[];
  };
  const cats: readonly Cat[] = SERVICE_CATEGORIES;

  const subcats = useMemo(() => {
    const found = cats.find((c) => c.name === category);
    return (found?.subcategories ?? []) as readonly Sub[];
  }, [cats, category]);

  useEffect(() => {
    if (!subcats.length) {
      setSubcategory("");
      return;
    }
    if (!subcats.some((s) => s.name === subcategory)) {
      setSubcategory(subcats[0]?.name || "");
    }
  }, [subcats, subcategory]);

  useEffect(
    () => () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [previews],
  );

  const normalizedPhone = phone ? normalizePhone(phone) : "";
  const phoneOk = !phone || looksLikeValidKePhone(phone);

  const canSubmit =
    name.trim().length >= 3 &&
    !!category &&
    description.trim().length >= 10 &&
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
      if (
        previews.some((p) => p.key === key) ||
        next.some((p) => p.key === key)
      ) {
        continue;
      }
      const url = URL.createObjectURL(f);
      next.push({ file: f, url, key });
    }
    if (next.length) {
      setPreviews((prev) => [...prev, ...next].slice(0, MAX_FILES));
    }
  }

  function onFileInputChange(files: FileList | null) {
    if (!files || !files.length) return;
    filesToAdd(files);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) {
      filesToAdd(e.dataTransfer.files);
    }
  }

  const removeAt = (idx: number) =>
    setPreviews((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== idx);
    });

  const move = (idx: number, dir: -1 | 1) =>
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
            folder: "qwiksale/services",
            onProgress: (pct) =>
              setUploadPct(
                Math.round(((done + pct / 100) / total) * 100),
              ),
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
        subcategory: subcategory || undefined,
        price:
          price === ""
            ? null
            : Math.max(0, Math.round(Number(price))),
        rateType,
        serviceArea: serviceArea || undefined,
        availability: availability || undefined,
        location: location.trim(),
        sellerPhone: normalizePhone(phone) || undefined,
      };

      if (!hideMedia) {
        const computedImage =
          uploaded[0]?.secure_url ??
          (previews[0]?.url || undefined) ??
          (existingImage || undefined);

        const computedGallery: string[] =
          uploaded.length
            ? uploaded.map((u) => u.secure_url)
            : previews.length
            ? previews.map((p) => p.url)
            : existingGallery?.length
            ? existingGallery
            : [];

        if (computedImage) payload["image"] = computedImage;
        if (computedGallery.length > 0) {
          payload["gallery"] = computedGallery;
        }
      }

      let resultId: string | null = null;

      if (editId) {
        const r = await fetch(
          `/api/services/${encodeURIComponent(editId)}`,
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
        resultId = editId;
        toast.success("Service updated!");
      } else {
        const r = await fetch("/api/services/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        if (r.status === 429) {
          const j = await r.json().catch(() => ({}));
          throw new Error(
            j?.error ||
              "You’re posting too fast. Please slow down.",
          );
        }
        const j = await r.json().catch(() => ({} as any));
        if (!r.ok || (j as any)?.error) {
          throw new Error(
            (j as any)?.error || `Failed to create (${r.status})`,
          );
        }
        resultId = String((j as any)?.serviceId || "");
        toast.success("Service posted!");
      }

      // Single navigation after submit (user action)
      if (resultId) {
        router.replace(`/service/${resultId}/edit`);
      } else {
        router.replace("/sell/service");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.message ||
          (editId
            ? "Failed to update service."
            : "Failed to post service."),
      );
    } finally {
      setSubmitting(false);
      setUploadPct(0);
    }
  }

  const notSignedIn = !isAuthenticated;

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
            You can sketch out your service, but you’ll need to sign in
            before publishing.
          </p>
          <div className="mt-4">
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent(
                "/sell/service",
              )}`}
              className="btn-gradient-primary inline-block"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue p-5 text-white shadow-soft">
        <h1 className="text-2xl font-bold">
          {editId ? "Edit Service" : "Post a Service"}
        </h1>
        <p className="text-white/90">
          {editId
            ? "Update your service details."
            : "Describe what you offer and where you work."}
        </p>
      </div>

      <form
        className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
        onSubmit={onSubmit}
      >
        {/* Name + Price + RateType */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label
              className="text-sm font-medium"
              htmlFor="sf-name"
            >
              Service name
            </label>
            <input
              id="sf-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              required
              minLength={3}
              placeholder="e.g. House Cleaning, Plumbing, Tutoring…"
            />
          </div>

          <div>
            <label
              className="text-sm font-medium"
              htmlFor="sf-price"
            >
              Price (KES)
            </label>
            <input
              id="sf-price"
              type="number"
              min={0}
              inputMode="numeric"
              value={price === "" ? "" : price}
              onChange={(e) =>
                setPrice(
                  e.currentTarget.value === ""
                    ? ""
                    : Math.max(
                        0,
                        Math.floor(
                          Number(e.currentTarget.value) || 0,
                        ),
                      ),
                )
              }
              onWheel={(e) =>
                (e.currentTarget as HTMLInputElement).blur()
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder='Leave empty for "Contact for quote"'
              aria-describedby="sf-price-help"
            />
            <p
              id="sf-price-help"
              className="mt-1 text-xs text-muted-foreground"
            >
              Leave empty to show <em>Contact for quote</em>.
            </p>

            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="rateType"
                  value="fixed"
                  checked={rateType === "fixed"}
                  onChange={() => setRateType("fixed")}
                  className="rounded border border-border"
                />
                Fixed
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="rateType"
                  value="hour"
                  checked={rateType === "hour"}
                  onChange={() => setRateType("hour")}
                  className="rounded border border-border"
                />
                /hour
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="rateType"
                  value="day"
                  checked={rateType === "day"}
                  onChange={() => setRateType("day")}
                  className="rounded border border-border"
                />
                /day
              </label>
            </div>
          </div>
        </div>

        {/* Category/Subcategory/ServiceArea */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              className="text-sm font-medium"
              htmlFor="sf-category"
            >
              Category
            </label>
            <select
              id="sf-category"
              value={category}
              onChange={(e) => setCategory(e.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
            >
              {cats.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="text-sm font-medium"
              htmlFor="sf-subcategory"
            >
              Subcategory (optional)
            </label>
            <select
              id="sf-subcategory"
              value={subcategory}
              onChange={(e) =>
                setSubcategory(e.currentTarget.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
            >
              {subcats.length > 0 ? (
                subcats.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))
              ) : (
                <option value="">—</option>
              )}
            </select>
          </div>

          <div>
            <label
              className="text-sm font-medium"
              htmlFor="sf-area"
            >
              Service area (optional)
            </label>
            <input
              id="sf-area"
              value={serviceArea}
              onChange={(e) =>
                setServiceArea(e.currentTarget.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="e.g. Nairobi & Kiambu"
            />
          </div>
        </div>

        {/* Availability/Location/Phone */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              className="text-sm font-medium"
              htmlFor="sf-avail"
            >
              Availability (optional)
            </label>
            <input
              id="sf-avail"
              value={availability}
              onChange={(e) =>
                setAvailability(e.currentTarget.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="e.g. Mon–Sat, 8am–6pm"
            />
          </div>
          <div>
            <label
              className="text-sm font-medium"
              htmlFor="sf-location"
            >
              Base location
            </label>
            <input
              id="sf-location"
              value={location}
              onChange={(e) =>
                setLocation(e.currentTarget.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="e.g. Nairobi"
            />
          </div>
          <div>
            <label
              className="text-sm font-medium"
              htmlFor="sf-phone"
            >
              Seller phone (optional)
            </label>
            <input
              id="sf-phone"
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="2547XXXXXXXX"
              inputMode="tel"
              aria-invalid={phone && !phoneOk ? "true" : undefined}
            />
            <div className="mt-1 text-xs text-muted-foreground">
              {phone
                ? phoneOk
                  ? `Normalized: ${normalizedPhone}`
                  : "Please use Safaricom format: 2547XXXXXXXX"
                : "Optional. Buyers can call or WhatsApp."}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mt-4">
          <label
            className="text-sm font-medium"
            htmlFor="sf-description"
          >
            Description
          </label>
          <textarea
            id="sf-description"
            value={description}
            onChange={(e) =>
              setDescription(e.currentTarget.value)
            }
            rows={5}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
            placeholder="Describe your service, experience, what’s included, etc."
            required
            minLength={10}
          />
        </div>

        {/* Photos */}
        {!hideMedia && (
          <section className="mt-4 space-y-3">
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
                      {Math.round(p.file.size / 1024)} KB
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

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="btn-gradient-primary"
          >
            {submitting
              ? editId
                ? "Saving…"
                : "Posting…"
              : editId
              ? "Save changes"
              : "Post service"}
          </button>
          <p className="text-xs text-muted-foreground">
            You can edit this service later from your dashboard.
          </p>
        </div>
      </form>
    </div>
  );
}
