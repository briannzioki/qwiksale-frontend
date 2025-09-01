// src/app/account/profile/ProfileClient.tsx
"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";

/* ----------------------------- Types & helpers ----------------------------- */
export type ProfileUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  username: string | null;
  whatsapp: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
};

type Props = { initialUser: ProfileUser };

function normalizeKePhone(raw: string): string {
  const trimmed = (raw || "").trim();
  if (/^\+254(7|1)\d{8}$/.test(trimmed)) return trimmed.replace(/^\+/, "");
  let s = trimmed.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}
function looksLikeValidKePhone(input: string) {
  return /^254(7|1)\d{8}$/.test(normalizeKePhone(input));
}
function looksLikeValidUsername(u: string) {
  return /^[a-zA-Z0-9._]{3,24}$/.test(u);
}

/* -------------------------------- Component -------------------------------- */
export default function ProfileClient({ initialUser }: Props) {
  const [saving, setSaving] = useState(false);

  // form fields (seeded from props)
  const [displayName, setDisplayName] = useState(initialUser.name || "");
  const [username, setUsername] = useState(initialUser.username || "");
  const [whatsapp, setWhatsapp] = useState(initialUser.whatsapp || "");
  const [address, setAddress] = useState(initialUser.address || "");
  const [postalCode, setPostal] = useState(initialUser.postalCode || "");
  const [city, setCity] = useState(initialUser.city || "");
  const [country, setCountry] = useState(initialUser.country || "");
  const [image, setImage] = useState<string | null>(initialUser.image);

  const [uploading, setUploading] = useState(false);

  const whatsappNormalized = useMemo(
    () => (whatsapp ? normalizeKePhone(whatsapp) : ""),
    [whatsapp]
  );

  /* ------------------------------- Save profile ----------------------------- */
  async function onSave(e: React.FormEvent) {
    e.preventDefault();

    if (!looksLikeValidUsername(username)) {
      toast.error("Username must be 3–24 chars (letters, numbers, dot, underscore).");
      return;
    }
    if (whatsapp && !looksLikeValidKePhone(whatsapp)) {
      toast.error("WhatsApp must be a valid KE number (e.g. 07XXXXXXXX or 2547XXXXXXXX).");
      return;
    }

    setSaving(true);
    try {
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: displayName || null,
          username,
          whatsapp: whatsappNormalized || null,
          address: address || null,
          postalCode: postalCode || null,
          city: city || null,
          country: country || null,
          image: image || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || "Failed to save profile");
      toast.success("Profile saved.");
    } catch (e: any) {
      toast.error(e?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------ Avatar upload ----------------------------- */
  async function onFileChange(file?: File) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Max file size is 2MB.");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/account/profile/photo", {
        method: "POST",
        body: fd,
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j?.url) {
        throw new Error(j?.error || "Upload failed");
      }
      setImage(j.url as string);
      toast.success("Photo updated. Don’t forget to Save.");
    } catch (e: any) {
      if (e?.message?.includes("404")) {
        toast.error("Avatar upload API not found. Create /api/account/profile/photo.");
      } else {
        toast.error(e?.message || "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  /* --------------------------------- UI ------------------------------------ */
  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">Your profile</h1>
          <p className="text-sm text-white/80 dark:text-slate-300">
            Update your username, WhatsApp and store details. Your username is shown on your listings.
          </p>
        </div>

        {/* Avatar */}
        <div className="card-surface p-4 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image || "/avatar-placeholder.png"}
            alt="Profile photo"
            className="h-16 w-16 rounded-full object-cover border border-black/10 dark:border-white/10"
          />
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-white/10">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFileChange(e.currentTarget.files?.[0])}
                disabled={uploading}
              />
              {uploading ? "Uploading…" : "Change photo"}
            </label>
            {image && (
              <button
                className="text-sm text-red-600 hover:underline"
                onClick={() => setImage(null)}
                title="This only clears the preview. Save to persist."
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={onSave} className="card-surface p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Display name</label>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Brian Nzioki"
              />
            </div>

            <div>
              <label className="label">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. brian254"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                3–24 chars. Letters, numbers, dot, underscore.
              </p>
            </div>
          </div>

          <div>
            <label className="label">WhatsApp (optional)</label>
            <input
              className="input"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="07XXXXXXXX or 2547XXXXXXXX"
              aria-invalid={!!whatsapp && !looksLikeValidKePhone(whatsapp)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Will be stored as{" "}
              <code className="font-mono">{whatsappNormalized || "—"}</code>
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">City (optional)</label>
              <input
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Country (optional)</label>
              <input
                className="input"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Postal code (optional)</label>
              <input
                className="input"
                value={postalCode}
                onChange={(e) => setPostal(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Address (optional)</label>
              <input
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, estate, etc."
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save changes"}
            </button>
            <a href="/dashboard" className="btn-outline">Back to dashboard</a>
          </div>
        </form>
      </div>
    </div>
  );
}
