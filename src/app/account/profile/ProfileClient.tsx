"use client";
// src/app/account/profile/ProfileClient.tsx

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { normalizeKenyanPhone } from "@/app/lib/phone";
import ProfilePhotoUploader from "@/app/components/account/ProfilePhotoUploader";
import DeleteAccountButton from "@/app/account/DeleteAccountButton";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  whatsapp: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  address: string | null;
  image?: string | null;
};

type MeProfileResponse = { user: Profile } | { error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;

export default function ProfileClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [image, setImage] = useState<string | null>(null);

  const [initialEmail, setInitialEmail] = useState("");
  const [initialUsername, setInitialUsername] = useState("");

  const [unauth, setUnauth] = useState(false);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/me/profile", {
          cache: "no-store",
          credentials: "same-origin",
          signal: ctrl.signal,
          headers: { accept: "application/json" },
        });
        if (r.status === 401) {
          setUnauth(true);
          return;
        }
        if (!r.ok) {
          toast.error("Failed to load profile.");
          return;
        }
        const j = (await r.json().catch(() => ({}))) as MeProfileResponse;
        const u = (j as any)?.user as Profile | undefined;
        if (alive && u) {
          const em = u.email ?? "";
          const un = u.username ?? "";
          setEmail(em);
          setInitialEmail(em);
          setUsername(un);
          setInitialUsername(un);
          setWhatsapp(u.whatsapp ?? "");
          setCity(u.city ?? "");
          setCountry(u.country ?? "");
          setPostalCode(u.postalCode ?? "");
          setAddress(u.address ?? "");
          setImage(u.image ?? null);
        }
      } catch {
        toast.error("Network error while loading profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  const normalizedWa = useMemo(() => {
    const raw = (whatsapp || "").trim();
    if (!raw) return "";
    return normalizeKenyanPhone(raw) || "";
  }, [whatsapp]);

  function snapNormalizeWhatsapp() {
    if (!whatsapp) return;
    if (!normalizedWa) return;
    const pretty = `+${normalizedWa}`;
    if (whatsapp !== pretty) setWhatsapp(pretty);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const payload: Record<string, unknown> = {
      city: city.trim(),
      country: country.trim(),
      postalCode: postalCode.trim(),
      address: address.trim(),
    };

    // email (optional change)
    const nextEmail = email.trim().toLowerCase();
    if (nextEmail && nextEmail !== (initialEmail || "").toLowerCase()) {
      if (!EMAIL_RE.test(nextEmail)) {
        toast.error("Enter a valid email.");
        return;
      }
      payload["email"] = nextEmail;
    }

    // username (optional change)
    const nextUser = username.trim();
    if (nextUser && nextUser !== (initialUsername || "").trim()) {
      if (!USERNAME_RE.test(nextUser)) {
        toast.error(
          "Username must be 3–24 chars (letters, numbers, ., _), no leading/trailing dot/underscore, no doubles."
        );
        return;
      }
      payload["username"] = nextUser;
    }

    // whatsapp
    const waRaw = whatsapp.trim();
    const wa = waRaw ? normalizeKenyanPhone(waRaw) : null;
    if (waRaw && !wa) {
      toast.error("Enter a valid Kenyan WhatsApp (07XXXXXXXX or +2547XXXXXXX).");
      return;
    }
    payload["whatsapp"] = wa ?? null;

    try {
      setSaving(true);
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as any)?.error || "Failed to save profile.");
        return;
      }

      if (payload["email"]) setInitialEmail(payload["email"] as string);
      if (payload["username"]) setInitialUsername(payload["username"] as string);

      toast.success("Profile updated!");
      // No router.refresh — keep UI optimistic
    } catch {
      toast.error("Network error while saving profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5">
        <p className="text-sm text-gray-600 dark:text-slate-400">Loading…</p>
      </div>
    );
  }

  if (unauth) {
    return (
      <div className="card p-5">
        <p className="text-sm">
          Please <Link className="underline" href="/signin?callbackUrl=%2Faccount%2Fprofile">sign in</Link> to view your profile.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-5" aria-busy={saving}>
      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Account</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" aria-invalid={!!email && !EMAIL_RE.test(email.trim().toLowerCase())} />
            <p className="text-xs text-gray-500 mt-1">Changing email may require re-verification.</p>
          </div>
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input id="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} aria-invalid={!!username && !USERNAME_RE.test(username.trim())} placeholder="yourname" />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Profile photo</h2>
        <ProfilePhotoUploader initialImage={image} />
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Contact</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="whatsapp" className="label">WhatsApp (optional)</label>
            <input id="whatsapp" className="input" placeholder="07XXXXXXXX or +2547XXXXXXX" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} onBlur={snapNormalizeWhatsapp} inputMode="tel" aria-invalid={!!whatsapp && !normalizedWa} />
            {whatsapp ? (
              <p className="mt-1 text-xs">
                Normalized: {normalizedWa ? <span className="text-emerald-600">+{normalizedWa}</span> : <span className="text-red-600">Invalid</span>}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Location</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label" htmlFor="city">City</label><input id="city" className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Nairobi" /></div>
          <div><label className="label" htmlFor="country">Country</label><input id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Kenya" /></div>
          <div><label className="label" htmlFor="postal">Postal code</label><input id="postal" className="input" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="00100" inputMode="numeric" /></div>
          <div><label className="label" htmlFor="address">Address</label><input id="address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, building, etc." /></div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-gradient-primary disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button>
        <Link href="/dashboard" className="btn-outline">Cancel</Link>
      </div>

      <div className="card p-5 border border-red-200/60 dark:border-red-800/40">
        <h2 className="text-base font-semibold mb-2 text-red-600">Danger zone</h2>
        <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
          This will permanently delete your account and all your listings. This action cannot be undone.
        </p>
        <DeleteAccountButton email={email} />
      </div>
    </form>
  );
}
