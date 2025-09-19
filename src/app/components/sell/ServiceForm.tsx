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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

        const id = String(j.serviceId || "");
        toast.success("Service posted");
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
      noValidate
    >
      <h2 className="text-lg font-bold">Post a Service</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Service name</label>
          <input
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
            value={category}
            onChange={(e) => {
              const nv = e.target.value;
              setCategory(nv);
              const first = subcategoryOptions(nv)[0]?.value || "";
              setSubcategory(first);
            }}
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
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Nairobi"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Service area (optional)</label>
          <input
            value={serviceArea}
            onChange={(e) => setServiceArea(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="e.g. Nairobi & Kiambu"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Availability (optional)</label>
          <input
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
          {busy ? "Posting…" : "Post service"}
        </button>
      </div>
    </form>
  );
}
