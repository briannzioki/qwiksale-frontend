// src/app/components/sell/ServiceForm.tsx
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { categoryOptions, subcategoryOptions } from "@/app/data/categories";
import { normalizeMsisdn } from "@/app/data/products"; // reuse the same normalizer
import { toast } from "react-hot-toast";

type Props = {
  /** Called after a service is successfully created with the new service ID */
  onCreatedAction?: (id: string) => void | Promise<void>;
  className?: string;
};

type RateType = "hour" | "day" | "fixed";

export default function ServiceForm({ onCreatedAction, className = "" }: Props) {
  // Precompute top-level options once
  const catOpts = useMemo(() => categoryOptions(), []);
  const [category, setCategory] = useState<string>(catOpts[0]?.value || "");

  // Subcategory depends on category
  const subOpts = useMemo(() => subcategoryOptions(category), [category]);
  const [subcategory, setSubcategory] = useState<string>(subOpts[0]?.value || "");

  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [rateType, setRateType] = useState<RateType>("fixed");
  const [serviceArea, setServiceArea] = useState("");
  const [availability, setAvailability] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [files, setFiles] = useState<File[]>([]); // placeholder for future image upload
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Strict boolean (was truthy string earlier)
  const can =
    name.trim().length > 0 &&
    category.length > 0 &&
    description.trim().length >= 10 &&
    (price === "" || Number(price) >= 0);

  const pickFiles = () => fileInputRef.current?.click();

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(e.target.files || []);
    setFiles(next.slice(0, 10));
    // reset to allow picking the same files again
    e.currentTarget.value = "";
  };

  const onChangeCategory = useCallback((value: string) => {
    setCategory(value);
    const first = subcategoryOptions(value)[0]?.value || "";
    setSubcategory(first);
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

      // Nudge: this lightweight form doesn’t upload images yet
      if (files.length > 0) {
        toast("Heads up: image upload isn’t wired yet — service will be created without photos.", {
          icon: "📷",
        });
      }

      setBusy(true);
      try {
        // Keep shape aligned with our API & later readers
        const payload = {
          name: name.trim(),
          description: description.trim(),
          category,
          subcategory: subcategory || null,
          price: price === "" ? null : Math.max(0, Math.floor(Number(price) || 0)),
          rateType,
          serviceArea: serviceArea.trim() || null,
          availability: availability.trim() || null,
          sellerPhone: msisdn ?? null,
          // prefer explicit 'location'; otherwise use serviceArea as a fallback for display
          location: (location || serviceArea).trim() || null,
        };

        const r = await fetch("/api/services/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const j = (await r.json().catch(() => ({}))) as any;
        if (!r.ok || j?.error) {
          throw new Error(j?.error || `Failed (${r.status})`);
        }

        // Be robust about where the ID might be
        const id: string =
          String(j?.serviceId || j?.id || j?.service?.id || j?.data?.id || "").trim();

        toast.success("Service posted");
        (window as any).plausible?.("Service Created", { props: { category, subcategory } });
        await onCreatedAction?.(id);
      } catch (err: any) {
        toast.error(err?.message || "Failed to create service");
      } finally {
        setBusy(false);
      }
    },
    [
      availability,
      busy,
      category,
      description,
      files.length,
      location,
      name,
      onCreatedAction,
      phone,
      price,
      rateType,
      serviceArea,
      subcategory,
    ]
  );

  return (
    <form
      onSubmit={submit}
      className={[
        "rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900",
        className,
      ].join(" ")}
      aria-labelledby="service-form-title"
      noValidate
    >
      <h2 id="service-form-title" className="text-lg font-bold">
        Post a Service
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="sf-name">
            Service name
          </label>
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
          <label className="text-sm font-medium" htmlFor="sf-category">
            Category
          </label>
          <select
            id="sf-category"
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
          <label className="text-sm font-medium" htmlFor="sf-subcategory">
            Subcategory (optional)
          </label>
          <select
            id="sf-subcategory"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {subOpts.length > 0 ? (
              subOpts.map((o) => (
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
          <label className="text-sm font-medium" htmlFor="sf-rateType">
            Rate type
          </label>
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
          <label className="text-sm font-medium" htmlFor="sf-price">
            Price (KES)
          </label>
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
          <label className="text-sm font-medium" htmlFor="sf-location">
            Base location
          </label>
          <input
            id="sf-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Nairobi"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="sf-area">
          Service area (optional)
          </label>
          <input
            id="sf-area"
            value={serviceArea}
            onChange={(e) => setServiceArea(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Nairobi & Kiambu"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="sf-avail">
            Availability (optional)
          </label>
          <input
            id="sf-avail"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Mon–Sat, 8am–6pm"
          />
        </div>

        {/* Lightweight placeholder for future image upload */}
        <div className="md:col-span-2">
          <label className="text-sm font-medium" htmlFor="sf-files">
            Photos (optional, up to 10)
          </label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={pickFiles}
              className="rounded-xl px-3 py-2 ring-1 ring-gray-300 dark:ring-gray-700"
            >
              Choose files
            </button>
            <input
              id="sf-files"
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
          {busy ? "Posting…" : "Post service"}
        </button>
      </div>
    </form>
  );
}
