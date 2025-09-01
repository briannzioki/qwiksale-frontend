// src/app/account/complete-profile/CompleteProfileClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

/* ----------------------------- Types & helpers ----------------------------- */
type Me = {
  id: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
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

export default function CompleteProfileClient() {
  const router = useRouter();
  const sp = useSearchParams();

  // Accept both ?next= and ?return= to avoid mismatches with older links
  const ret = useMemo(() => sp.get("next") || sp.get("return") || "/", [sp]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  // fields
  const [username, setUsername] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostal] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const whatsappNormalized = whatsapp ? normalizeKePhone(whatsapp) : "";

  /* --------------------------------- Load me -------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.status === 401) {
          toast.error("Please sign in.");
          router.replace(`/signin?callbackUrl=${encodeURIComponent(ret)}`);
          return;
        }
        const j = await r.json().catch(() => null);

        // Handle either { user: {...} } or the user object at root
        const u: Me | null =
          j?.user && typeof j.user === "object"
            ? j.user
            : j && typeof j === "object" && "email" in j
            ? (j as Me)
            : null;

        if (!alive) return;
        if (!u?.email) {
          toast.error("Please sign in.");
          router.replace(`/signin?callbackUrl=${encodeURIComponent(ret)}`);
          return;
        }

        setMe(u);
        setUsername(u.username ?? "");
        setWhatsapp(u.whatsapp ?? "");
        setAddress(u.address ?? "");
        setPostal(u.postalCode ?? "");
        setCity(u.city ?? "");
        setCountry(u.country ?? "");
      } catch {
        toast.error("Could not load your account. Try again.");
      } finally {
        alive && setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, ret]);

  /* --------------------------------- Save ---------------------------------- */
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
          username,
          whatsapp: whatsappNormalized || null,
          address: address || null,
          postalCode: postalCode || null,
          city: city || null,
          country: country || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || "Failed to save");

      toast.success("Profile saved!");
      // After saving, server should mark profile as complete. Go back.
      router.replace(ret);
    } catch (e: any) {
      toast.error(e?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  /* --------------------------------- UI ------------------------------------ */
  if (loading) {
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-2xl">Loading…</div>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-2xl">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">Complete your profile</h1>
          <p className="text-sm text-white/80 dark:text-slate-300">
            Add a username and (optionally) WhatsApp and address details.
          </p>
        </div>

        <form onSubmit={onSave} className="card-surface p-4 mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Username</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="e.g. brian254"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Shown on your listings. 3–24 chars, letters/numbers/dot/underscore.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">WhatsApp (optional)</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="07XXXXXXXX or 2547XXXXXXXX"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              aria-invalid={!!whatsapp && !looksLikeValidKePhone(whatsapp)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Will be stored as <code className="font-mono">{whatsappNormalized || "—"}</code>
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold mb-1">City (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Country (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold mb-1">Postal code (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={postalCode}
                onChange={(e) => setPostal(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Address (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#161748] text-white px-4 py-2 font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save & continue"}
            </button>
            <button
              type="button"
              className="rounded-xl border px-4 py-2"
              onClick={() => router.replace(ret)}
            >
              Skip for now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
