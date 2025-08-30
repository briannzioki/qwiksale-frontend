// src/app/onboarding/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import Link from "next/link";
import { normalizeKenyanPhone } from "@/app/lib/phone";

type Profile = {
  username: string;
  whatsapp: string;   // optional
  city: string;       // optional
  country: string;    // optional
  postalCode: string; // optional
  address: string;    // optional
};

export default function OnboardingPage() {
  const { status } = useSession();
  const sp = useSearchParams();
  const router = useRouter();
  const ret = sp.get("return") || "/";

  const [form, setForm] = useState<Profile>({
    username: "",
    whatsapp: "",
    city: "",
    country: "",
    postalCode: "",
    address: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/me/profile", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (alive && j?.user) {
            setForm({
              username: j.user.username ?? "",
              whatsapp: j.user.whatsapp ?? "",
              city: j.user.city ?? "",
              country: j.user.country ?? "",
              postalCode: j.user.postalCode ?? "",
              address: j.user.address ?? "",
            });
          }
        }
      } catch {}
      finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const waRaw = form.whatsapp.trim();
    const wa = waRaw ? normalizeKenyanPhone(waRaw) : null;

    const payload = {
      username: form.username.trim(),
      whatsapp: wa ? wa : (waRaw ? "" : null), // empty string clears, null leaves unchanged
      city: form.city.trim(),
      country: form.country.trim(),
      postalCode: form.postalCode.trim(),
      address: form.address.trim(),
    };

    try {
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j?.error || "Failed to save profile.");
        return;
        }
      toast.success("Profile saved!");
      router.replace(ret);
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-xl">
          <div className="hero-surface">
            <h1 className="text-2xl md:text-3xl font-extrabold mb-1">Finish your profile</h1>
            <p className="text-sm text-white/80 dark:text-slate-300">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-xl">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">Finish your profile</h1>
          <p className="text-sm text-white/80 dark:text-slate-300">
            Only <b>username</b> is recommended now; the rest helps us personalise your experience.
            You can skip and complete later in <Link href="/settings" className="underline">Settings</Link>.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card-surface p-4 mt-6 space-y-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Username</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="e.g. brian254"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
            <p className="text-xs text-gray-500 mt-1">Shown on your listings and profile. Must be unique.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">WhatsApp number (optional)</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="07XXXXXXXX or +2547…"
              value={form.whatsapp}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">City (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Nairobi"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Country (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Kenya"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">Postal code (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="00100"
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Address (optional)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Street, building, etc."
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#161748] text-white px-4 py-2 font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save & continue"}
            </button>
            <button
              type="button"
              className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
              onClick={() => router.replace(ret)}
              disabled={saving}
            >
              Skip for now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
