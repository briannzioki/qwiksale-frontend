"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { categoryOptions, subcategoryOptions } from "@/app/lib/categories";
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
    (isEdit ? (props as EditProps).initialValues : (props as CreateProps).initialValues) ??
    undefined;

  const catOpts = useMemo(() => categoryOptions() ?? [], []);
  const startCategory = sv(initial?.category || catOpts[0]?.value);
  const [category, setCategory] = useState<string>(startCategory);

  const firstSubFor = useCallback((cat: string): string => {
    const subs = subcategoryOptions(cat) ?? [];
    return sv(subs[0]?.value);
  }, []);

  const startSubcategory = sv(initial?.subcategory || firstSubFor(startCategory));
  const [subcategory, setSubcategory] = useState<string>(startSubcategory);

  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [customSubcategory, setCustomSubcategory] = useState("");

  const [name, setName] = useState<string>(sv(initial?.name));
  const [price, setPrice] = useState<number | "">(
    typeof initial?.price === "number" ? initial.price : "",
  );
  const [rateType, setRateType] = useState<RateType>(
    ((initial?.rateType as RateType) ?? "fixed") as RateType,
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

  // Effective labels (what we actually save)
  const effectiveCategory = useCustomCategory
    ? (customCategory.trim() || category || "").trim()
    : (category || "").trim();

  const effectiveSubcategory = useCustomCategory
    ? (customSubcategory.trim() || subcategory || "").trim()
    : (subcategory || "").trim();

  const baseDescriptionOk = description.trim().length >= 10;
  const basePriceOk = price === "" || Number(price) >= 0;
  const categoryOk = useCustomCategory ? effectiveCategory.length >= 3 : effectiveCategory.length > 0;

  const canSubmit = name.trim().length > 0 && categoryOk && baseDescriptionOk && basePriceOk;

  const onChangeCategory = useCallback(
    (value: string) => {
      setCategory(value);
      setSubcategory(firstSubFor(value));
    },
    [firstSubFor],
  );

  // cache-aware actions
  const { addService, updateService } = useServices();

  async function uploadPending(): Promise<string[]> {
    if (!pendingFiles.length) return [];
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

  const phoneInvalid = Boolean(phone) && !normalizeMsisdn(phone);

  const handleSuggestCategory = useCallback(() => {
    const cat = useCustomCategory && customCategory.trim() ? customCategory.trim() : category;
    const sub =
      useCustomCategory && customSubcategory.trim() ? customSubcategory.trim() : subcategory || "";

    try {
      (window as any).plausible?.("Suggest Service Category", {
        props: {
          category: cat,
          subcategory: sub,
        },
      });
    } catch {
      // ignore analytics failures
    }
    try {
      window.dispatchEvent(
        new CustomEvent("qs:category:suggest", {
          detail: {
            scope: "service",
            category: cat,
            subcategory: sub,
          },
        }),
      );
    } catch {
      // ignore dispatch failures
    }
    toast.success("Thanks - we’ll use this to refine service categories over time.");
  }, [category, subcategory, customCategory, customSubcategory, useCustomCategory]);

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
          "Image uploads are not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (and optionally NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET).",
        );
        return;
      }

      const cat = useCustomCategory && customCategory.trim() ? customCategory.trim() : category;
      const sub =
        useCustomCategory && customSubcategory.trim()
          ? customSubcategory.trim()
          : subcategory || null;

      if (!cat || cat.trim().length < 1) {
        toast.error("Please choose or enter a category.");
        return;
      }

      setBusy(true);
      try {
        const uploaded = await uploadPending();
        const mergedGallery = [...gallery, ...uploaded].slice(0, 6).map(String);
        const cover = mergedGallery[0] || null;

        const payload = {
          name: name.trim(),
          description: description.trim(),
          category: cat,
          subcategory: sub,
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
              : created && typeof created === "object" && "id" in created
                ? String((created as any).id)
                : undefined;
          if (!newId) throw new Error("Create failed: no id returned");
          toast.success("Service posted");
          (window as any).plausible?.("Service Created", {
            props: {
              category: cat,
              subcategory: sub || undefined,
            },
          });
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
      customCategory,
      customSubcategory,
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
      useCustomCategory,
    ],
  );

  const fieldLabel = "text-sm font-medium text-[var(--text)]";
  const fieldHint = "mt-1 text-[11px] text-[var(--text-muted)] leading-relaxed sm:text-xs";
  const inputBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const selectBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus";

  return (
    <form
      onSubmit={submit}
      className={[
        "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 shadow-soft sm:p-5",
        className,
      ].join(" ")}
      aria-labelledby="service-form-title"
      noValidate
    >
      <h2
        id="service-form-title"
        className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg"
      >
        {isEdit ? "Edit Service" : "Post a Service"}
      </h2>

      {/* Name + Price + RateType */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:gap-4 md:grid-cols-3 md:gap-6">
        <div className="md:col-span-2">
          <label className={fieldLabel} htmlFor="sf-name">
            Service name
          </label>
          <input
            id="sf-name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            className={inputBase}
            required
            minLength={3}
            placeholder="e.g. House Cleaning, Plumbing, Tutoring…"
          />
        </div>

        <div>
          <label className={fieldLabel} htmlFor="sf-price">
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
                  : Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)),
              )
            }
            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            className={inputBase}
            placeholder="Leave empty for “Contact for quote”"
            aria-describedby="sf-price-help"
          />
          <p id="sf-price-help" className={fieldHint}>
            Leave empty to show <em className="text-[var(--text)]">Contact for quote</em>.
          </p>

          <div className="mt-2 grid grid-cols-3 gap-2 text-xs sm:text-sm">
            <label className="inline-flex items-center gap-2 text-[var(--text-muted)]">
              <input
                type="radio"
                name="rateType"
                value="fixed"
                checked={rateType === "fixed"}
                onChange={() => setRateType("fixed")}
                className="h-4 w-4 border-[var(--border)] bg-[var(--bg)]"
              />
              <span className="text-[var(--text)]">Fixed</span>
            </label>
            <label className="inline-flex items-center gap-2 text-[var(--text-muted)]">
              <input
                type="radio"
                name="rateType"
                value="hour"
                checked={rateType === "hour"}
                onChange={() => setRateType("hour")}
                className="h-4 w-4 border-[var(--border)] bg-[var(--bg)]"
              />
              <span className="text-[var(--text)]">/hour</span>
            </label>
            <label className="inline-flex items-center gap-2 text-[var(--text-muted)]">
              <input
                type="radio"
                name="rateType"
                value="day"
                checked={rateType === "day"}
                onChange={() => setRateType("day")}
                className="h-4 w-4 border-[var(--border)] bg-[var(--bg)]"
              />
              <span className="text-[var(--text)]">/day</span>
            </label>
          </div>
        </div>
      </div>

      {/* Category/Subcategory/ServiceArea */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:gap-4 md:grid-cols-3 md:gap-6">
        <div>
          <label className={fieldLabel} htmlFor="sf-category">
            Category
          </label>
          <select
            id="sf-category"
            value={category}
            onChange={(e) => onChangeCategory(e.currentTarget.value)}
            className={selectBase}
          >
            {(catOpts ?? []).map((o: any) => {
              const val = sv(o?.value);
              const key = String(o?.value ?? o?.label ?? val);
              return (
                <option key={key} value={val}>
                  {o?.label ?? val}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className={fieldLabel} htmlFor="sf-subcategory">
            Subcategory (optional)
          </label>
          <select
            id="sf-subcategory"
            value={subcategory}
            onChange={(e) => setSubcategory(e.currentTarget.value)}
            className={selectBase}
          >
            {subOpts.length > 0 ? (
              subOpts.map((o: any) => {
                const val = sv(o?.value);
                const key = String(o?.value ?? o?.label ?? val);
                return (
                  <option key={key} value={val}>
                    {o?.label ?? val}
                  </option>
                );
              })
            ) : (
              <option value="">-</option>
            )}
          </select>
          <p className={fieldHint}>
            Can’t see a good fit?{" "}
            <button
              type="button"
              onClick={handleSuggestCategory}
              className="rounded-md px-1 font-semibold text-[var(--text)] underline underline-offset-2 hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              Suggest a new category
            </button>
            .
          </p>
        </div>

        <div>
          <label className={fieldLabel} htmlFor="sf-area">
            Service area (optional)
          </label>
          <input
            id="sf-area"
            value={serviceArea}
            onChange={(e) => setServiceArea(e.currentTarget.value)}
            className={inputBase}
            placeholder="e.g. Nairobi & Kiambu"
          />
        </div>
      </div>

      {/* Custom category toggle + fields */}
      <div className="mt-3 space-y-2">
        <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={useCustomCategory}
            onChange={(e) => setUseCustomCategory(e.currentTarget.checked)}
            className="rounded border-[var(--border)] bg-[var(--bg)]"
          />
          <span className="leading-relaxed">Use my own category labels for this service</span>
        </label>

        {useCustomCategory && (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:gap-6">
            <div>
              <label className="text-xs font-medium text-[var(--text)]" htmlFor="sf-custom-category">
                Custom category (required)
              </label>
              <input
                id="sf-custom-category"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.currentTarget.value)}
                className={inputBase}
                placeholder="e.g. Beauty & Wellness - Mobile Salon"
                minLength={3}
                aria-invalid={useCustomCategory && !categoryOk}
              />
            </div>
            <div>
              <label
                className="text-xs font-medium text-[var(--text)]"
                htmlFor="sf-custom-subcategory"
              >
                Custom subcategory (optional)
              </label>
              <input
                id="sf-custom-subcategory"
                value={customSubcategory}
                onChange={(e) => setCustomSubcategory(e.currentTarget.value)}
                className={inputBase}
                placeholder="e.g. Home Visits Only"
              />
            </div>
          </div>
        )}
      </div>

      {/* Availability/Location/Phone */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:gap-4 md:grid-cols-3 md:gap-6">
        <div>
          <label className={fieldLabel} htmlFor="sf-avail">
            Availability (optional)
          </label>
          <input
            id="sf-avail"
            value={availability}
            onChange={(e) => setAvailability(e.currentTarget.value)}
            className={inputBase}
            placeholder="e.g. Mon-Sat, 8am-6pm"
          />
        </div>

        <div>
          <label className={fieldLabel} htmlFor="sf-location">
            Base location
          </label>
          <input
            id="sf-location"
            value={location}
            onChange={(e) => setLocation(e.currentTarget.value)}
            className={inputBase}
            placeholder="e.g. Nairobi"
          />
        </div>

        <div>
          <label className={fieldLabel} htmlFor="sf-phone">
            Seller phone (optional)
          </label>
          <input
            id="sf-phone"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            className={inputBase}
            placeholder="2547XXXXXXXX"
            inputMode="tel"
            aria-invalid={phoneInvalid || undefined}
          />
          <div className={fieldHint}>
            {phone
              ? phoneInvalid
                ? "Please use Safaricom format: 2547XXXXXXXX"
                : `Normalized: ${normalizeMsisdn(phone)}`
              : "Optional. Buyers can call or WhatsApp."}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="mt-3 sm:mt-4">
        <label className={fieldLabel} htmlFor="sf-description">
          Description
        </label>
        <textarea
          id="sf-description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={5}
          className={inputBase}
          placeholder="Describe your service, experience, what’s included, etc."
          required
          minLength={10}
        />
      </div>

      {/* Photos */}
      <div className="mt-3 sm:mt-4 md:col-span-2">
        <GalleryUploader
          value={gallery}
          onChangeAction={(next) => setGallery(next)}
          onFilesSelectedAction={(files) => setPendingFiles((cur) => [...cur, ...files].slice(0, 6))}
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
        >
          {busy ? (isEdit ? "Saving…" : "Posting…") : isEdit ? "Save changes" : "Post service"}
        </button>
      </div>
    </form>
  );
}
