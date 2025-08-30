// src/app/account/complete-profile/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

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

export default function CompleteProfilePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const ret = useMemo(() => sp.get("return") || "/", [sp]);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);

  // fields
  const [username, setUsername] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostal] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!ok) return;
        const u: Me = j.user;
        setMe(u);
        setUsername(u.username ?? "");
        setWhatsapp(u.whatsapp ?? "");
        setAddress(u.address ?? "");
        setPostal(u.postalCode ?? "");
        setCity(u.city ?? "");
        setCountry(u.country ?? "");
      } catch {
        toast.error("Please sign in again.");
        router.replace(`/signin?callbackUrl=${encodeURIComponent(ret)}`);
      } finally {
        ok && setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [router, ret]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          whatsapp,
          address,
          postalCode,
          city,
          country,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Failed to save");
      toast.success("Profile saved!");
      router.replace(ret);
    } catch (e: any) {
      toast.error(e?.message || "Could not save profile");
    }
  }

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
              placeholder="+2547XXXXXXXX"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
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
              className="rounded-xl bg-[#161748] text-white px-4 py-2 font-semibold hover:opacity-90"
            >
              Save & continue
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
