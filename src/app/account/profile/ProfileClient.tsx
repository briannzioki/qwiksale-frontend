// src/app/account/profile/ProfileClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

/* ----------------------------- Types & helpers ----------------------------- */
type Me = {
  id: string;
  email: string | null;
  name?: string | null;
  username?: string | null;
  image?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

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

const PLACEHOLDER_AVATAR = "/avatar-placeholder.png";

/* -------------------------------- Component -------------------------------- */
export default function ProfileClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  // form fields
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostal] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const whatsappNormalized = useMemo(
    () => (whatsapp ? normalizeKePhone(whatsapp) : ""),
    [whatsapp]
  );

  /* --------------------------------- Load me -------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.status === 401) {
          toast.error("Please sign in.");
          window.location.href = "/signin?callbackUrl=/account/profile";
          return;
        }
        const j = (await r.json().catch(() => null)) as Me | { user?: Me } | null;
        const u: Me | null =
          j && typeof j === "object" && "user" in (j as any) ? (j as any).user : (j as Me | null);

        if (!alive) return;
        if (!u?.email) {
          toast.error("Please sign in.");
          window.location.href = "/signin?callbackUrl=/account/profile";
          return;
        }

        setMe(u);
        setDisplayName(u.name ?? "");
        setUsername(u.username ?? "");
        setWhatsapp(u.whatsapp ?? "");
        setAddress(u.address ?? "");
        setPostal(u.postalCode ?? "");
        setCity(u.city ?? "");
        setCountry(u.country ?? "");
        setImage(u.image ?? null);
      } catch {
        toast.error("Could not load your profile.");
      } finally {
        alive && setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
          image: image || null, // ✅ include avatar so Remove works when saved
        }),
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || "Failed to save profile");

      // Refresh local state with server response if provided
      if (j.user) {
        const u = j.user as Me;
        setMe(u);
        setDisplayName(u.name ?? "");
        setUsername(u.username ?? "");
        setWhatsapp(u.whatsapp ?? "");
        setAddress(u.address ?? "");
        setPostal(u.postalCode ?? "");
        setCity(u.city ?? "");
        setCountry(u.country ?? "");
        setImage(u.image ?? null);
      }

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
      const j = (await r.json().catch(() => ({}))) as any;
      if (!r.ok || !j?.url) {
        throw new Error(j?.error || "Upload failed");
      }
      setImage(j.url as string);
      toast.success("Photo updated. Click “Save changes” to persist.");
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
  if (loading) {
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-3xl">Loading…</div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-3xl">Couldn’t load your profile.</div>
      </div>
    );
  }

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
            src={image || PLACEHOLDER_AVATAR}
            alt="Profile photo"
            className="h-16 w-16 rounded-full object-cover border border-black/10 dark:border-white/10"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_AVATAR;
            }}
          />
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-white/10">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFileChange(e.currentTarget.files?.[0] || undefined)}
                disabled={uploading}
              />
              {uploading ? "Uploading…" : "Change photo"}
            </label>
            {image && (
              <button
                className="text-sm text-red-600 hover:underline"
                onClick={() => {
                  setImage(null);
                  toast("Photo cleared. Click “Save changes” to persist.", { icon: "ℹ️" });
                }}
                title="Clears the preview; Save to persist."
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
