// src/app/account/complete-profile/CompleteProfileClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import ProfilePhotoUploader from "@/app/components/account/ProfilePhotoUploader";

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
  image?: string | null; // existing avatar, if any
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

// 3–24; letters/digits/._; no leading/trailing sep; no doubles
const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;
function looksLikeValidUsername(u: string) {
  return USERNAME_RE.test(u);
}
function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

type NameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

/* -------------------------------- Component -------------------------------- */

export default function CompleteProfileClient() {
  const router = useRouter();
  const sp = useSearchParams();

  // Default redirect goes to dashboard (unless a safe ?next/return provided)
  const ret = useMemo(() => {
    const raw = sp.get("next") || sp.get("return");
    if (isSafePath(raw)) return raw;
    return "/dashboard";
  }, [sp]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const [username, setUsername] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostal] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const [nameStatus, setNameStatus] = useState<NameStatus>("idle");
  const usernameAbort = useRef<AbortController | null>(null);
  const redirectedRef = useRef(false); // prevent ping-pong redirects

  const whatsappNormalized = useMemo(
    () => (whatsapp ? normalizeKePhone(whatsapp) : ""),
    [whatsapp]
  );

  /* -------------------------------- Load /api/me ------------------------------- */
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    (async () => {
      try {
        const r = await fetch("/api/me", {
          cache: "no-store",
          signal: ctrl.signal,
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (r.status === 401) {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            toast.error("Please sign in.");
            router.replace(`/signin?callbackUrl=${encodeURIComponent(ret)}`);
          }
          return;
        }
        const j = await r.json().catch(() => null);
        const u: Me | null =
          j?.user && typeof j.user === "object"
            ? j.user
            : j && typeof j === "object" && "email" in j
            ? (j as Me)
            : null;

        if (!alive) return;
        if (!u?.email) {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            toast.error("Please sign in.");
            router.replace(`/signin?callbackUrl=${encodeURIComponent(ret)}`);
          }
          return;
        }

        setMe(u);
        setUsername((u.username ?? "").trim());
        setWhatsapp(u.whatsapp ?? "");
        setAddress(u.address ?? "");
        setPostal(u.postalCode ?? "");
        setCity(u.city ?? "");
        setCountry(u.country ?? "");
      } catch (e: any) {
        if (e?.name !== "AbortError") toast.error("Could not load your account. Try again.");
      } finally {
        alive && setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [router, ret]);

  /* ------------------- Debounced username availability check ------------------- */
  useEffect(() => {
    const u = username.trim();

    if (!u) {
      setNameStatus("idle");
      return;
    }
    if (!looksLikeValidUsername(u)) {
      setNameStatus("invalid");
      return;
    }

    setNameStatus("checking");

    const t = setTimeout(async () => {
      usernameAbort.current?.abort();
      const ctrl = new AbortController();
      usernameAbort.current = ctrl;

      try {
        const res = await fetch(`/api/username/check?u=${encodeURIComponent(u)}`, {
          signal: ctrl.signal,
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (!res.ok) {
          setNameStatus("error");
          return;
        }
        const j = await res.json();
        if (j?.valid === false) {
          setNameStatus("invalid");
        } else if (j?.available === true) {
          setNameStatus("available");
        } else {
          setNameStatus("taken");
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setNameStatus("error");
      }
    }, 400);

    return () => clearTimeout(t);
  }, [username]);

  /* ----------------------------------- Save ----------------------------------- */
  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim();

    if (!looksLikeValidUsername(u)) {
      toast.error("Username must be 3–24 chars (letters, numbers, dot, underscore).");
      return;
    }
    if (nameStatus === "taken" || nameStatus === "invalid" || nameStatus === "checking") {
      toast.error(
        nameStatus === "checking"
          ? "Please wait for the username check…"
          : nameStatus === "taken"
          ? "That username is taken."
          : "Invalid username."
      );
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
        headers: { "Content-Type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          username: u,
          // image is handled via /api/account/profile/photo by the uploader
          whatsapp: whatsappNormalized || null,
          address: address.trim() || null,
          postalCode: postalCode.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
        }),
      });
      let j: any = null;
      try {
        j = await r.json();
      } catch {
        /* non-JSON error */
      }
      if (!r.ok || j?.error) throw new Error(j?.error || `Failed to save (${r.status})`);

      toast.success("Profile saved!");
      router.replace(ret); // default /dashboard
    } catch (e: any) {
      toast.error(e?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------- Render --------------------------------- */
  const nameHint =
    nameStatus === "available"
      ? "Looks good — available."
      : nameStatus === "taken"
      ? "That username is taken."
      : nameStatus === "invalid"
      ? "Use 3–24 chars: letters, numbers, dot, underscore."
      : nameStatus === "checking"
      ? "Checking availability…"
      : "";

  const nameHintClass =
    nameStatus === "available"
      ? "text-emerald-700"
      : nameStatus === "taken" || nameStatus === "invalid" || nameStatus === "error"
      ? "text-red-600"
      : "text-gray-500";

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
            Add a username and (optionally) a profile photo, WhatsApp, and address details.
          </p>
        </div>

        <form onSubmit={onSave} className="card-surface p-4 mt-6 space-y-4" noValidate aria-busy={saving}>
          {/* Username */}
          <div>
            <label htmlFor="username" className="label">
              Username
            </label>
            <input
              id="username"
              className="input"
              placeholder="e.g. brian254"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={(e) => setUsername(e.target.value.trim())}
              required
              minLength={3}
              maxLength={24}
              aria-invalid={nameStatus === "taken" || nameStatus === "invalid" ? true : undefined}
              aria-describedby="username-help username-status"
              disabled={saving}
              inputMode="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <p id="username-help" className="text-xs text-gray-500 mt-1">
              Shown on your listings. 3–24 chars, letters/numbers/dot/underscore.
            </p>
            {nameHint && (
              <p id="username-status" className={`text-xs mt-1 ${nameHintClass}`} aria-live="polite">
                {nameHint}
              </p>
            )}
          </div>

          {/* Native photo uploader (Cloudinary-backed) */}
          <div>
            <label className="label">Profile photo</label>
            <ProfilePhotoUploader initialImage={me?.image ?? null} />
          </div>

          {/* WhatsApp */}
          <div>
            <label className="label">WhatsApp (optional)</label>
            <input
              className="input"
              placeholder="07XXXXXXXX or 2547XXXXXXXX"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              aria-invalid={!!whatsapp && !looksLikeValidKePhone(whatsapp)}
              disabled={saving}
              inputMode="tel"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-gray-500 mt-1">
              Will be stored as <code className="font-mono">{whatsappNormalized || "—"}</code>
            </p>
          </div>

          {/* Location */}
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

          {/* Address */}
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
                disabled={saving}
                placeholder="Street, estate, etc."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving || nameStatus === "checking" || nameStatus === "invalid"}
              className="btn-gradient-primary"
            >
              {saving ? "Saving…" : "Save & continue"}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => router.replace(ret)}
              disabled={saving}
            >
              Skip for now
            </button>
          </div>

          {/* SR status line for screen readers */}
          <p className="sr-only" aria-live="polite">
            {saving ? "Saving profile…" : ""}
          </p>
        </form>
      </div>
    </div>
  );
}
