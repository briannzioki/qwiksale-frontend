// src/app/account/profile/ProfileClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { normalizeKenyanPhone } from "@/app/lib/phone";

/**
 * Client-side profile editor used by /account/profile
 *
 * This component fetches the current user's profile, lets them edit a few fields,
 * and PATCHes back to /api/me/profile. It intentionally does not assume any props,
 * so it's safe to import as <ProfileClient /> from the page file.
 */

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  whatsapp: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  address: string | null;
  image?: string | null; // 👈 include current avatar
};

type MeProfileResponse =
  | {
      user: Profile;
    }
  | {
      error: string;
    };

export default function ProfileClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [whatsapp, setWhatsapp] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [postalCode, setPostalCode] = useState<string>("");
  const [address, setAddress] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);

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
          toast.error("Please sign in to view your profile.");
          router.replace("/signin?callbackUrl=%2Faccount%2Fprofile");
          return;
        }
        if (!r.ok) {
          toast.error("Failed to load profile.");
          return;
        }
        const j = (await r.json().catch(() => ({}))) as MeProfileResponse;
        const u = (j as any)?.user as Profile | undefined;
        if (alive && u) {
          setEmail(u.email ?? "");
          setUsername(u.username ?? "");
          setWhatsapp(u.whatsapp ?? "");
          setCity(u.city ?? "");
          setCountry(u.country ?? "");
          setPostalCode(u.postalCode ?? "");
          setAddress(u.address ?? "");
          setImage(u.image ?? null); // 👈
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
  }, [router]);

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

    const waRaw = whatsapp.trim();
    const wa = waRaw ? normalizeKenyanPhone(waRaw) : null;
    if (waRaw && !wa) {
      toast.error("Enter a valid Kenyan WhatsApp number (e.g. 07XXXXXXXX or +2547XXXXXXX).");
      return;
    }

    const payload = {
      whatsapp: wa ?? null,
      city: city.trim(),
      country: country.trim(),
      postalCode: postalCode.trim(),
      address: address.trim(),
      // Note: profile photo is now managed via /api/account/profile/photo
    };

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
      toast.success("Profile updated!");
      router.refresh();
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

  return (
    <form onSubmit={onSave} className="space-y-5" aria-busy={saving}>
      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Account</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Email</label>
            <input className="input" value={email} disabled readOnly />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" value={username} disabled readOnly />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Contact</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="whatsapp" className="label">
              WhatsApp (optional)
            </label>
            <input
              id="whatsapp"
              className="input"
              placeholder="07XXXXXXXX or +2547XXXXXXX"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              onBlur={snapNormalizeWhatsapp}
              inputMode="tel"
              aria-invalid={!!whatsapp && !normalizedWa}
            />
            {whatsapp ? (
              <p className="mt-1 text-xs">
                Normalized:{" "}
                {normalizedWa ? (
                  <span className="text-emerald-600">+{normalizedWa}</span>
                ) : (
                  <span className="text-red-600">Invalid</span>
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Location</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="city">
              City
            </label>
            <input
              id="city"
              className="input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Nairobi"
            />
          </div>
          <div>
            <label className="label" htmlFor="country">
              Country
            </label>
            <input
              id="country"
              className="input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Kenya"
            />
          </div>
          <div>
            <label className="label" htmlFor="postal">
              Postal code
            </label>
            <input
              id="postal"
              className="input"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="00100"
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="label" htmlFor="address">
              Address
            </label>
            <input
              id="address"
              className="input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, building, etc."
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-gradient-primary disabled:opacity-60">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <Link href="/dashboard" className="btn-outline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
