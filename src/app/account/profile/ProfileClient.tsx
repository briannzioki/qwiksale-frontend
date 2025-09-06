// src/app/account/profile/ProfileClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/* -------------------------- Cloudinary config (TS-safe) -------------------------- */

const ENV = process.env as Record<string, string | undefined>;
const CLOUD_NAME = ENV["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";
const UPLOAD_PRESET = ENV["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"] ?? "";
const CAN_UPLOAD = !!(CLOUD_NAME && UPLOAD_PRESET);

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

  // socials (placeholder — not persisted yet)
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [xhandle, setXHandle] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  const whatsappNormalized = useMemo(
    () => (whatsapp ? normalizeKePhone(whatsapp) : ""),
    [whatsapp]
  );

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store", signal: ctrl.signal });
        if (r.status === 401) {
          toast.error("Please sign in.");
          window.location.href = "/signin?callbackUrl=/account/profile";
          return;
        }
        const j = (await r.json().catch(() => null)) as Me | { user?: Me } | null;
        const u: Me | null = j && "user" in (j as any) ? (j as any).user : (j as Me | null);

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

        // Socials placeholder (fill when you add real columns)
        setWebsite("");
        setInstagram("");
        setFacebook("");
        setXHandle("");
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          toast.error("Could not load your profile.");
        }
      } finally {
        alive && setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

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
          // future: website/instagram/facebook/x once backend supports it
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (j as any)?.error) throw new Error((j as any)?.error || "Failed to save profile");
      toast.success("Profile saved.");
    } catch (e: any) {
      toast.error(e?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Direct unsigned upload to Cloudinary, then POST JSON to
   * /api/account/profile/photo with { secureUrl, publicId } which your API expects.
   */
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
    if (!CAN_UPLOAD) {
      toast.error(
        "Cloudinary not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET."
      );
      return;
    }

    setUploading(true);
    try {
      // 1) Upload to Cloudinary
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", UPLOAD_PRESET);

      const up = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {
        method: "POST",
        body: form,
      });

      const uj = (await up.json().catch(() => null)) as {
        secure_url?: string;
        public_id?: string;
        error?: { message?: string };
      } | null;

      if (!up.ok || !uj?.secure_url || !uj?.public_id) {
        throw new Error(uj?.error?.message || "Cloudinary upload failed");
      }

      // 2) Tell backend to persist + derive variants
      const r = await fetch("/api/account/profile/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secureUrl: uj.secure_url, publicId: uj.public_id }),
      });

      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        user?: { image?: string | null };
        variants?: { avatarUrl?: string; previewUrl?: string };
        error?: string;
      };

      if (!r.ok || j?.error) throw new Error(j?.error || "Photo update failed");

      // Prefer nicely transformed avatar if available
      const nextSrc = j?.variants?.avatarUrl || j?.user?.image || uj.secure_url;
      setImage(nextSrc || null);
      toast.success("Photo updated.");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Delete your account permanently? This removes your listings and favorites. This cannot be undone."
      )
    ) {
      return;
    }
    try {
      const r = await fetch("/api/account/delete", { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (j as any)?.error) throw new Error((j as any)?.error || "Delete failed");
      toast.success("Account deleted. Goodbye!");
      window.location.href = "/";
    } catch (e: any) {
      toast.error(e?.message || "Unable to delete account right now");
    }
  }

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
                disabled={uploading}
              >
                Remove
              </button>
            )}
            {!CAN_UPLOAD && (
              <span className="text-xs text-amber-700">
                Set <code>NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME</code> and{" "}
                <code>NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET</code> to enable uploads.
              </span>
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
                disabled={saving}
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
                disabled={saving}
                aria-invalid={!looksLikeValidUsername(username)}
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
              disabled={saving}
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
                disabled={saving}
              />
            </div>
            <div>
              <label className="label">Country (optional)</label>
              <input
                className="input"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={saving}
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
                disabled={saving}
              />
            </div>
            <div>
              <label className="label">Address (optional)</label>
              <input
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, estate, etc."
                disabled={saving}
              />
            </div>
          </div>

          {/* Socials anchor */}
          <h2 id="socials" className="text-base font-semibold pt-4">Social links (optional)</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Website</label>
              <input
                className="input"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
                disabled={saving}
              />
            </div>
            <div>
              <label className="label">Instagram</label>
              <input
                className="input"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@handle"
                disabled={saving}
              />
            </div>
            <div>
              <label className="label">Facebook</label>
              <input
                className="input"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="Page or profile"
                disabled={saving}
              />
            </div>
            <div>
              <label className="label">X (Twitter)</label>
              <input
                className="input"
                value={xhandle}
                onChange={(e) => setXHandle(e.target.value)}
                placeholder="@handle"
                disabled={saving}
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

        {/* Danger zone */}
        <div className="card-surface p-4 border-red-200">
          <h3 className="font-semibold text-red-700 mb-2">Danger zone</h3>
          <p className="text-sm text-red-700/90 mb-3">
            Deleting your account removes your listings and favorites permanently.
          </p>
          <button onClick={deleteAccount} className="rounded-lg bg-red-600 text-white px-4 py-2 hover:bg-red-700">
            Delete my account
          </button>
        </div>
      </div>
    </div>
  );
}
