// src/app/components/sell/ServiceForm.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
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
  gallery: string[];
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

export default function ServiceForm({ onCreatedAction, className = "" }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categoryOptions()[0]?.value || "");
  const subOptions = useMemo(() => subcategoryOptions(category), [category]);
  const [subcategory, setSubcategory] = useState<string>(subOptions[0]?.value || "");

  const [price, setPrice] = useState<number | "">("");
  const [rateType, setRateType] = useState<RateType>("fixed");

  const [serviceArea, setServiceArea] = useState("");
  const [availability, setAvailability] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  const [phone, setPhone] = useState("");
  const [files, setFiles] = useState<File[]>([]); // placeholder for future image upload
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");

  const subOpts = useMemo(() => subcategoryOptions(category) ?? [], [category]);

  const can =
    name.trim() &&
    category &&
    (subcategory || true) && // subcategory optional for some service cats
    description.trim().length >= 10 &&
    (price === "" || Number(price) >= 0);

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

      // Nudge: this lightweight form doesn’t upload images yet
      if (files.length > 0) {
        toast("Heads up: image upload isn’t wired yet — service will be created without photos.", {
          icon: "📷",
        });
      }

      setBusy(true);
      try {
        // Basic payload that matches /api/services/create
        const payload = {
          name: name.trim(),
          description: description.trim(),
          category,
          subcategory: subcategory || null,
          price: price === "" ? null : Math.max(0, Math.floor(Number(price) || 0)),
          rateType,
          serviceArea: serviceArea.trim() || null,
          availability: availability.trim() || null,
          // image/gallery omitted in this lightweight form
          sellerPhone: msisdn ?? null,
          location: (location || serviceArea).trim() || null,
          sellerPhone: msisdn ?? null,
          image: cover,
          gallery: mergedGallery,
          images: mergedGallery,
        };

        if (!isEdit) {
          const { id } = await addService(payload);
          toast.success("Service posted");
          (window as any).plausible?.("Service Created", { props: { category, subcategory } });
          await props.onCreatedAction?.(id);
          setPendingFiles([]);
          return;
        }

        const id = String(j.serviceId || "");
        toast.success("Service posted");
        await onCreatedAction?.(id);
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
      location,
      name,
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
      className={[
        "rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900",
        className,
      ].join(" ")}
      noValidate
    >
      <h2 className="text-lg font-bold">Post a Service</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Service name</label>
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
          <label className="text-sm font-medium">Category</label>
          <select
            id="sf-category"
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

        <div>
          <label className="text-sm font-medium">Subcategory (optional)</label>
          <select
            id="sf-subcategory"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {subOptions.length > 0 ? (
              subOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            ) : (
              <option value="">—</option>
            )}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Rate type</label>
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
          <label className="text-sm font-medium">Price (KES)</label>
          <input
            id="sf-price"
            type="number"
            min={0}
            value={price === "" ? "" : price}
            onChange={(e) =>
              setPrice(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value) || 0)))
            }
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="Leave empty for “Contact for quote”"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Base location</label>
          <input
            id="sf-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Nairobi"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Service area (optional)</label>
          <input
            id="sf-area"
            value={serviceArea}
            onChange={(e) => setServiceArea(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Nairobi & Kiambu"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Availability (optional)</label>
          <input
            id="sf-avail"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Mon–Sat, 8am–6pm"
          />
        </div>

        {/* Lightweight placeholder for future image upload (kept for UI parity) */}
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Photos (optional, up to 10)</label>
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

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="submit"
          disabled={!can || busy}
          className={`rounded-xl px-4 py-2 text-white ${
            !can || busy ? "bg-gray-400" : "bg-[#161748] hover:opacity-90"
          }`}
        >
          {busy ? (isEdit ? "Saving…" : "Posting…") : isEdit ? "Save changes" : "Post service"}
        </button>
      </div>
    </form>
  );
}
