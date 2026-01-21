// src/app/account/profile/ProfileClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

  // New bits
  storeLocationUrl?: string | null;
  emailVerified?: string | null; // ISO string or null
  verified?: boolean | null; // store / seller verification (NOT email)
  profileComplete?: boolean;
};

type MeProfileResponse = { user: Profile } | { error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function looksLikeGoogleMapsUrl(input: string): boolean {
  const s = String(input || "").trim();
  if (!s) return false;

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  return (
    host === "maps.google.com" ||
    (host.endsWith(".google.com") && path.includes("/maps")) ||
    (host === "goo.gl" && path.startsWith("/maps")) ||
    (host.endsWith(".goo.gl") && path.includes("/maps"))
  );
}

type SaveNotice =
  | null
  | {
      kind: "success" | "error";
      message: string;
    };

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

  const [storeLocationUrl, setStoreLocationUrl] = useState("");

  const [initialEmail, setInitialEmail] = useState("");
  const [initialUsername, setInitialUsername] = useState("");

  const [emailVerified, setEmailVerified] = useState(false);
  const [storeVerified, setStoreVerified] = useState(false);

  const [unauth, setUnauth] = useState(false);

  const [notice, setNotice] = useState<SaveNotice>(null);
  const lastSaveAtRef = useRef<number>(0);

  const verifyEmailHref = useMemo(() => {
    return `/account/verify-email?next=${encodeURIComponent("/account/profile")}&auto=1`;
  }, []);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    (async () => {
      try {
        const r = await fetch("/api/me/profile", {
          cache: "no-store",
          credentials: "include",
          signal: ctrl.signal,
          headers: { accept: "application/json", "cache-control": "no-store" },
        });

        if (r.status === 401) {
          if (alive) setUnauth(true);
          return;
        }

        if (!r.ok) {
          toast.error("Failed to load profile.");
          if (alive) setNotice({ kind: "error", message: "Failed to load profile." });
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

          setStoreLocationUrl(u.storeLocationUrl ?? "");
          setEmailVerified(Boolean((u as any)?.emailVerified || (u as any)?.email_verified));
          setStoreVerified(Boolean((u as any)?.verified));
        }
      } catch {
        toast.error("Network error while loading profile.");
        if (alive) setNotice({ kind: "error", message: "Network error while loading profile." });
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

  function clearNoticeSoon() {
    const now = Date.now();
    lastSaveAtRef.current = now;
    window.setTimeout(() => {
      if (lastSaveAtRef.current === now) setNotice(null);
    }, 4500);
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    setNotice(null);

    const trimmedStoreLocation = storeLocationUrl.trim();
    if (trimmedStoreLocation && !looksLikeGoogleMapsUrl(trimmedStoreLocation)) {
      const msg = "Store location URL must be a valid Google Maps link (maps.google.com or goo.gl/maps).";
      toast.error(msg);
      setNotice({ kind: "error", message: msg });
      clearNoticeSoon();
      return;
    }

    const payload: Record<string, unknown> = {
      city: city.trim(),
      country: country.trim(),
      postalCode: postalCode.trim(),
      address: address.trim(),
      storeLocationUrl: trimmedStoreLocation || null,
    };

    // email (optional change)
    const nextEmail = email.trim().toLowerCase();
    const prevEmail = (initialEmail || "").trim().toLowerCase();
    if (nextEmail && nextEmail !== prevEmail) {
      if (!EMAIL_RE.test(nextEmail)) {
        const msg = "Enter a valid email.";
        toast.error(msg);
        setNotice({ kind: "error", message: msg });
        clearNoticeSoon();
        return;
      }
      payload["email"] = nextEmail;
    }

    // username (optional change)
    const nextUser = username.trim();
    const prevUser = (initialUsername || "").trim();
    if (nextUser && nextUser !== prevUser) {
      if (!USERNAME_RE.test(nextUser)) {
        const msg =
          "Username must be 3-24 chars (letters, numbers, ., _), no leading/trailing dot/underscore, no doubles.";
        toast.error(msg);
        setNotice({ kind: "error", message: msg });
        clearNoticeSoon();
        return;
      }
      payload["username"] = nextUser;
    }

    // whatsapp
    const waRaw = whatsapp.trim();
    const wa = waRaw ? normalizeKenyanPhone(waRaw) : null;
    if (waRaw && !wa) {
      const msg = "Enter a valid Kenyan WhatsApp (07XXXXXXXX or +2547XXXXXXX).";
      toast.error(msg);
      setNotice({ kind: "error", message: msg });
      clearNoticeSoon();
      return;
    }
    payload["whatsapp"] = wa ?? null;

    try {
      setSaving(true);

      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "cache-control": "no-store",
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok) {
        const msg = String((j as any)?.error || "Failed to save profile.");
        toast.error(msg);
        setNotice({ kind: "error", message: msg });
        clearNoticeSoon();
        return;
      }

      // Snap initial values to new saved state where relevant
      if (payload["email"]) {
        setInitialEmail(String(payload["email"]));
        setEmailVerified(false);
      }
      if (payload["username"]) {
        setInitialUsername(String(payload["username"]));
      }

      const savedUser = (j as any)?.user as Profile | undefined;
      if (savedUser) {
        setEmail(savedUser.email ?? "");
        setUsername(savedUser.username ?? "");
        setWhatsapp(savedUser.whatsapp ?? "");
        setCity(savedUser.city ?? "");
        setCountry(savedUser.country ?? "");
        setPostalCode(savedUser.postalCode ?? "");
        setAddress(savedUser.address ?? "");
        setStoreLocationUrl(savedUser.storeLocationUrl ?? "");
        setEmailVerified(Boolean((savedUser as any)?.emailVerified || (savedUser as any)?.email_verified));
        setStoreVerified(Boolean((savedUser as any)?.verified));
        if (typeof savedUser.image === "string" || savedUser.image === null) {
          setImage(savedUser.image ?? null);
        }
      }

      const okMsg = "Changes saved.";
      toast.success(okMsg);
      setNotice({ kind: "success", message: okMsg });
      clearNoticeSoon();
    } catch {
      const msg = "Network error while saving profile.";
      toast.error(msg);
      setNotice({ kind: "error", message: msg });
      clearNoticeSoon();
    } finally {
      setSaving(false);
    }
  }

  const cardClass =
    "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-5 shadow-sm";

  const sectionTitleClass = "text-sm sm:text-base font-semibold text-[var(--text)]";

  const helpTextClass = "mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]";

  if (loading) {
    return (
      <div className={cardClass}>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  if (unauth) {
    return (
      <div className={cardClass}>
        <p className="text-xs sm:text-sm text-[var(--text)]">
          Please{" "}
          <Link
            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 ring-focus rounded"
            href="/signin?callbackUrl=%2Faccount%2Fprofile"
          >
            sign in
          </Link>{" "}
          to view your profile.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-4 sm:space-y-6 text-[var(--text)]" aria-busy={saving}>
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className={[
            "rounded-2xl border p-3 text-xs sm:text-sm shadow-sm",
            "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
          ].join(" ")}
          data-testid={notice.kind === "success" ? "profile-save-success" : "profile-save-error"}
        >
          {notice.message}
        </div>
      ) : null}

      <div className={cardClass}>
        <div className="mb-2 sm:mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitleClass}>Account</h2>
          {storeVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
              <span aria-hidden>✓</span>
              <span>Verified seller</span>
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="email"
              aria-invalid={!!email && !EMAIL_RE.test(email.trim().toLowerCase())}
            />

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {email ? (
                emailVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
                    <span aria-hidden>✓</span>
                    <span>Email verified</span>
                  </span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
                      <span aria-hidden>!</span>
                      Verify email to boost trust
                    </span>

                    <Link
                      href={verifyEmailHref}
                      prefetch={false}
                      data-testid="profile-verify-email"
                      className={[
                        "inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-2.5 py-1 text-[11px] font-semibold",
                        "text-[var(--text)] hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                        "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                      ].join(" ")}
                    >
                      Verify now
                    </Link>
                  </>
                )
              ) : null}
            </div>

            <p className={helpTextClass}>Changing your email may require re-verification.</p>
          </div>

          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              name="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={!!username && !USERNAME_RE.test(username.trim())}
              placeholder="yourname"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
            <p className={helpTextClass}>This appears on your store and listings.</p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
          Want to change your password?{" "}
          <Link
            href={`/reset-password?return=${encodeURIComponent("/account/profile")}`}
            prefetch={false}
            className="text-[var(--text)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 ring-focus rounded"
          >
            Reset password
          </Link>
          .
        </p>

        <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm sm:p-4" aria-label="Ecosystem shortcuts">
          <div className="text-sm font-semibold text-[var(--text)]">Earn or get help faster</div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            QwikSale supports requests and delivery. You can post what you need, or create a carrier profile tied to this account to earn from deliveries.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/carrier" prefetch={false} className="btn-outline" data-testid="profile-carrier-entry">
              Carrier
            </Link>
            <Link href="/requests/new" prefetch={false} className="btn-outline" data-testid="profile-post-request-entry">
              Post a request
            </Link>
            <Link href="/delivery" prefetch={false} className="btn-outline" data-testid="profile-delivery-entry">
              Delivery
            </Link>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs">
            If you haven’t created a carrier profile yet, the Carrier link will guide you through onboarding.
          </p>
        </div>
      </div>

      <div className={cardClass}>
        <h2 className={`mb-2 sm:mb-3 ${sectionTitleClass}`}>Profile photo</h2>
        <ProfilePhotoUploader initialImage={image} />
        <p className={helpTextClass}>
          If you change your photo, it may take a moment to appear everywhere.
        </p>
      </div>

      <div className={cardClass}>
        <h2 className={`mb-2 sm:mb-3 ${sectionTitleClass}`}>Contact</h2>
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="whatsapp" className="label">
              WhatsApp (optional)
            </label>
            <input
              id="whatsapp"
              name="whatsapp"
              className="input"
              placeholder="07XXXXXXXX or +2547XXXXXXX"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              onBlur={snapNormalizeWhatsapp}
              inputMode="tel"
              aria-invalid={!!whatsapp && !normalizedWa}
              autoComplete="tel"
            />
            {whatsapp ? (
              <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">
                Normalized:{" "}
                {normalizedWa ? (
                  <span className="font-semibold text-[var(--text)]">+{normalizedWa}</span>
                ) : (
                  <span className="font-semibold text-[var(--text)]">Invalid</span>
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <h2 className={`mb-2 sm:mb-3 ${sectionTitleClass}`}>Location</h2>
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="city">
              City
            </label>
            <input
              id="city"
              name="city"
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
              name="country"
              className="input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Kenya"
            />
          </div>

          <div>
            <label className="label" htmlFor="postalCode">
              Postal code
            </label>
            <input
              id="postalCode"
              name="postalCode"
              className="input"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="00100"
              inputMode="numeric"
              autoComplete="postal-code"
            />
          </div>

          <div>
            <label className="label" htmlFor="address">
              Address
            </label>
            <input
              id="address"
              name="address"
              className="input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, building, etc."
              autoComplete="street-address"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="storeLocationUrl">
              Store location (Google Maps URL)
            </label>
            <input
              id="storeLocationUrl"
              name="storeLocationUrl"
              className="input"
              value={storeLocationUrl}
              onChange={(e) => setStoreLocationUrl(e.target.value)}
              placeholder="https://maps.google.com/… or https://goo.gl/maps/…"
              autoComplete="url"
            />
            <p className={helpTextClass}>
              This link can be shown on your listings to help buyers find your store or meeting point. Only Google Maps links are allowed.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <button
          type="submit"
          disabled={saving}
          className="btn-gradient-primary disabled:opacity-60"
          data-testid="profile-save-cta"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <Link href="/dashboard" className="btn-outline">
          Cancel
        </Link>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 sm:p-5 shadow-sm">
        <h2 className="mb-1.5 sm:mb-2 text-sm sm:text-base font-semibold text-[var(--text)]">Danger zone</h2>
        <p className="mb-2.5 sm:mb-3 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
          This will permanently delete your account and all your listings. This action cannot be undone.
        </p>
        <DeleteAccountButton email={email} />
      </div>
    </form>
  );
}
