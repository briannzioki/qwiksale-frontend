// src/app/components/sell/ServiceForm.tsx
"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { categoryOptions, subcategoryOptions } from "@/app/data/categories";
import { normalizeMsisdn } from "@/app/data/products";
import GalleryUploader from "@/app/components/media/GalleryUploader";
import { useServices } from "@/app/lib/servicesStore";

type InitialService = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price: number | null; // null => contact for quote
  rateType: "hour" | "day" | "fixed";
  serviceArea: string | null;
  availability: string | null;
  image: string | null;
  gallery: string[] | null;
  /** Some older data/APIs use `images` instead of `gallery` */
  images?: string[] | null;
  location: string | null;
  status: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT";
};

type BaseProps = {
  className?: string;
  onCreatedAction?: (id: string) => void | Promise<void>;
  onUpdatedAction?: (id: string) => void | Promise<void>;
};

type CreateProps = BaseProps & {
  mode?: "create";
  serviceId?: undefined;
  initialValues?: Partial<InitialService>;
};

type EditProps = BaseProps & {
  mode: "edit";
  serviceId: string;
  initialValues: InitialService;
};

type Props = CreateProps | EditProps;
type RateType = "hour" | "day" | "fixed";

// Coercion helpers
const s = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const sv = (v: unknown): string => (v == null ? "" : s(v));

// ✅ Public guard (matches your client pages)
const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";

export default function ServiceForm(props: Props) {
  const { className = "" } = props;
  const isEdit = props.mode === "edit";
  const initial =
    (isEdit
      ? (props as EditProps).initialValues
      : (props as CreateProps).initialValues) ?? undefined;

  const catOpts = useMemo(() => categoryOptions() ?? [], []);
  const startCategory = sv(initial?.category || catOpts[0]?.value);
  const [category, setCategory] = useState<string>(startCategory);

  const firstSubFor = useCallback((cat: string): string => {
    const subs = subcategoryOptions(cat) ?? [];
    return sv(subs[0]?.value);
  }, []);

  const startSubcategory = sv(initial?.subcategory || firstSubFor(startCategory));
  const [subcategory, setSubcategory] = useState<string>(startSubcategory);

  const [name, setName] = useState<string>(sv(initial?.name));
  const [price, setPrice] = useState<number | "">(
    typeof initial?.price === "number" ? initial.price : ""
  );
  const [rateType, setRateType] = useState<RateType>(
    ((initial?.rateType as RateType) ?? "fixed") as RateType
  );
  const [serviceArea, setServiceArea] = useState<string>(sv(initial?.serviceArea));
  const [availability, setAvailability] = useState<string>(sv(initial?.availability));
  const [location, setLocation] = useState<string>(sv(initial?.location));
  const [description, setDescription] = useState<string>(sv(initial?.description));
  const [phone, setPhone] = useState("");

  // gallery: prefer `gallery`, fall back to `images`
  const initialGallery: string[] =
    Array.isArray(initial?.gallery) && initial?.gallery?.length
      ? (initial!.gallery as string[]).filter(Boolean).map(String)
      : Array.isArray((initial as any)?.images)
      ? ((initial as any).images as string[]).filter(Boolean).map(String)
      : [];
  const [gallery, setGallery] = useState<string[]>(initialGallery);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [busy, setBusy] = useState(false);

  const subOpts = useMemo(() => subcategoryOptions(category) ?? [], [category]);

  // Keep subcategory valid when category changes
  useEffect(() => {
    const subs = subcategoryOptions(category) ?? [];
    if (subs.length && !subs.some((o: any) => o?.value === subcategory)) {
      setSubcategory(sv(subs[0]?.value));
    }
  }, [category, subcategory]);

  const canSubmit =
    name.trim().length > 0 &&
    category.length > 0 &&
    description.trim().length >= 10 &&
    (price === "" || Number(price) >= 0);

  const onChangeCategory = useCallback(
    (value: string) => {
      setCategory(value);
      setSubcategory(firstSubFor(value));
    },
    [firstSubFor]
  );

  // cache-aware actions
  const { addService, updateService } = useServices();

  async function uploadPending(): Promise<string[]> {
    if (!pendingFiles.length) return [];
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

  const phoneInvalid = Boolean(phone) && !normalizeMsisdn(phone);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (busy) return;

      const msisdn = phone ? normalizeMsisdn(phone) : null;
      if (phone && !msisdn) {
        toast.error("Phone must be Safaricom format (2547XXXXXXXX)");
        return;
      }

      // ✅ Guard: avoid trying to upload if image uploads aren’t configured
      if (pendingFiles.length > 0 && !CLOUD_NAME) {
        toast.error(
          "Image uploads are not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (and optionally NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET)."
        );
        return;
      }

      setBusy(true);
      try {
        const uploaded = await uploadPending();
        const mergedGallery = [...gallery, ...uploaded].slice(0, 10).map(String);
        const cover = mergedGallery[0] || null;

        const payload = {
          name: name.trim(),
          description: description.trim(),
          category,
          subcategory: subcategory || null,
          price: price === "" ? null : Math.max(0, Math.floor(Number(price) || 0)),
          rateType,
          serviceArea: serviceArea.trim() || null,
          availability: availability.trim() || null,
          location: (location || serviceArea).trim() || null,
          sellerPhone: msisdn ?? null,
          image: cover,
          gallery: mergedGallery,
          // keep backwards compat with APIs expecting `images`
          images: mergedGallery,
        };

        if (!isEdit) {
          const created = await addService(payload);
          const newId =
            typeof created === "string"
              ? created
              : (created && typeof created === "object" && "id" in created
                  ? String((created as any).id)
                  : undefined);
          if (!newId) throw new Error("Create failed: no id returned");
          toast.success("Service posted");
          (window as any).plausible?.("Service Created", { props: { category, subcategory } });
          await props.onCreatedAction?.(newId);
          setPendingFiles([]);
          return;
        }

        const id = (props as EditProps).serviceId;
        await updateService(id, payload);
        toast.success("Changes saved");
        await props.onUpdatedAction?.(id);
        setPendingFiles([]);
      } catch (err: any) {
        toast.error(err?.message || (isEdit ? "Failed to save changes" : "Failed to create service"));
      } finally {
        setBusy(false);
      }
    },
    [
      addService,
      availability,
      busy,
      category,
      description,
      gallery,
      isEdit,
      location,
      name,
      pendingFiles.length,
      phone,
      price,
      props,
      rateType,
      serviceArea,
      subcategory,
      updateService,
    ]
  );

  return (
    <form
      onSubmit={submit}
      className={["rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900", className].join(" ")}
      aria-labelledby="service-form-title"
      noValidate
    >
      <h2 id="service-form-title" className="text-lg font-bold">
        {isEdit ? "Edit Service" : "Post a Service"}
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="sf-name">Service name</label>
          <input
            id="sf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            required
            minLength={3}
            placeholder="e.g. House Cleaning, Plumbing, Tutoring…"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="sf-category">Category</label>
          <select
            id="sf-category"
            value={category}
            onChange={(e) => onChangeCategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {(catOpts ?? []).map((o: any) => {
              const val = sv(o?.value);
              const key = s(o?.value ?? o?.label ?? val);
              return (
                <option key={key} value={val}>
                  {o?.label ?? val}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="sf-subcategory">Subcategory (optional)</label>
          <select
            id="sf-subcategory"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {subOpts.length > 0
              ? subOpts.map((o: any) => {
                  const val = sv(o?.value);
                  const key = s(o?.value ?? o?.label ?? val);
                  return (
                    <option key={key} value={val}>
                      {o?.label ?? val}
                    </option>
                  );
                })
              : <option value="">—</option>}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="sf-rateType">Rate type</label>
          <select
            id="sf-rateType"
            value={rateType}
            onChange={(e) => setRateType(e.target.value as RateType)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="fixed">Fixed</option>
            <option value="hour">Per hour</option>
            <option value="day">Per day</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="sf-price">Price (KES)</label>
          <input
            id="sf-price"
            type="number"
            min={0}
            inputMode="numeric"
            value={price === "" ? "" : price}
            onChange={(e) =>
              setPrice(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value) || 0)))
            }
            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="Leave empty for “Contact for quote”"
            aria-describedby="sf-price-help"
          />
          <p id="sf-price-help" className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            Leave empty to show <em>Contact for quote</em>.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="sf-location">Base location</label>
          <input
            id="sf-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Nairobi"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="sf-area">Service area (optional)</label>
          <input
            id="sf-area"
            value={serviceArea}
            onChange={(e) => setServiceArea(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Nairobi & Kiambu"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="sf-avail">Availability (optional)</label>
          <input
            id="sf-avail"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Mon–Sat, 8am–6pm"
          />
        </div>

        {/* Phone (optional) */}
        <div>
          <label className="text-sm font-medium" htmlFor="sf-phone">Seller phone (optional)</label>
          <input
            id="sf-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="2547XXXXXXXX"
            inputMode="tel"
            aria-invalid={phoneInvalid || undefined}
          />
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            {phone
              ? phoneInvalid
                ? "Please use Safaricom format: 2547XXXXXXXX"
                : `Normalized: ${normalizeMsisdn(phone)}`
              : "Optional. Buyers can call or WhatsApp."}
          </div>
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
            accept="image/*,.jpg,.jpeg,.png,.webp"
            maxSizeMB={10}
          />
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400" aria-live="polite">
            {pendingFiles.length ? `${pendingFiles.length} new selected (to upload on save)` : "No new files selected"}
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="submit"
          disabled={!canSubmit || busy}
          className={`rounded-xl px-4 py-2 text-white ${!canSubmit || busy ? "bg-gray-400" : "bg-[#161748] hover:opacity-90"}`}
          aria-busy={busy ? "true" : "false"}
        >
          {busy ? (isEdit ? "Saving…" : "Posting…") : isEdit ? "Save changes" : "Post service"}
        </button>
      </div>
    </form>
  );
}
