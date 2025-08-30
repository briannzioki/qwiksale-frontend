"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";

function normalizeKenyanPhone(raw: string): string | null {
  let s = (raw || "").trim().replace(/\D+/g, "");
  if (!s) return null;
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+254(7|1)\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  if (/^254(7|1)\d{8}$/.test(s)) return s;
  return null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const returnTo = sp.get("return") || "/";

  const { data: session, status } = useSession();

  const [username, setUsername] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Kenya");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    setUsername((session.user as any)?.username || "");
    setCity((session as any)?.city || "");
    setCountry((session as any)?.country || "Kenya");
    setPostalCode((session as any)?.postalCode || "");
    setAddress((session as any)?.address || "");
    setWhatsapp((session as any)?.whatsapp || "");
  }, [session]);

  const disabled = useMemo(() => {
    return !username || username.trim().length < 3;
  }, [username]);

  if (status === "loading") {
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-xl card-surface p-6">Loading…</div>
      </div>
    );
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const uname = username.trim().toLowerCase();
    if (!/^[a-z0-9_\.]{3,20}$/i.test(uname)) {
      toast.error("Username must be 3–20 characters (letters, numbers, _ or .)");
      return;
    }

    let wa: string | null = null;
    if (whatsapp.trim()) {
      const p = normalizeKenyanPhone(whatsapp);
      if (!p) {
        toast.error("Enter a valid Kenyan WhatsApp number, e.g. 07XXXXXXXX");
        return;
      }
      wa = p;
    }

    try {
      setSaving(true);
      const r = await fetch("/api/profile/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          username: uname,
          whatsapp: wa,
          city: city || null,
          country: country || null,
          postalCode: postalCode || null,
          address: address || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        throw new Error(j?.error || `Save failed (${r.status})`);
      }
      toast.success("Profile updated");
      router.replace(returnTo);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-xl">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">Finish your profile</h1>
          <p className="text-sm text-white/80 dark:text-slate-300">
            Only <b>username</b> is required. You can add WhatsApp & location later.
          </p>
        </div>

        <form onSubmit={onSave} className="mt-6 card-surface p-4 grid gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Username *</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="e.g. brian_k"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs mt-1 text-gray-500">3–20 characters, letters/numbers/_/.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">WhatsApp (optional)</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="07XXXXXXXX or +2547XXXXXXX"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">City (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Nairobi"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Country (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Kenya"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">Postal code (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="00100"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Address (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Apartment, street, etc."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={saving || disabled}
              className="w-full rounded-xl bg-[#161748] text-white px-4 py-2 font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save & continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
