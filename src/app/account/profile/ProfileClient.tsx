// src/app/account/profile/ProfileClient.tsx
"use client";

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

  // New bits
  storeLocationUrl?: string | null;
  emailVerified?: string | null; // ISO string or null
  verified?: boolean | null; // store / seller verification (NOT email)
  profileComplete?: boolean;
};

type MeProfileResponse = { user: Profile } | { error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;

function looksLikeGoogleMapsUrl(input: string): boolean {
  if (!input) return false;
  let url: URL;
  try {
    url = new URL(input);
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

  // New: store location Google Maps URL
  const [storeLocationUrl, setStoreLocationUrl] = useState("");

  // Track initial values for validation / change-detection
  const [initialEmail, setInitialEmail] = useState("");
  const [initialUsername, setInitialUsername] = useState("");

  // New: email verification + store verification flags
  const [emailVerified, setEmailVerified] = useState(false);
  const [storeVerified, setStoreVerified] = useState(false);

  const [unauth, setUnauth] = useState(false);

  const verifyEmailHref = useMemo(() => {
    // return back to this page; auto-send code once on page load
    return `/account/verify-email?next=${encodeURIComponent("/account/profile")}&auto=1`;
  }, []);

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
          if (alive) setUnauth(true);
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

          // New bits
          setStoreLocationUrl(u.storeLocationUrl ?? "");
          setEmailVerified(
            Boolean((u as any)?.emailVerified || (u as any)?.email_verified),
          );
          setStoreVerified(Boolean((u as any)?.verified));
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

    const trimmedStoreLocation = storeLocationUrl.trim();

    if (trimmedStoreLocation && !looksLikeGoogleMapsUrl(trimmedStoreLocation)) {
      toast.error(
        "Store location URL must be a valid Google Maps link (maps.google.com or goo.gl/maps).",
      );
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
          "Username must be 3-24 chars (letters, numbers, ., _), no leading/trailing dot/underscore, no doubles.",
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
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        toast.error((j as any)?.error || "Failed to save profile.");
        return;
      }

      // Snap initial values to new saved state where relevant
      if (payload["email"]) {
        setInitialEmail(payload["email"] as string);
        setEmailVerified(false); // changed email => verification reset server-side
      }
      if (payload["username"]) {
        setInitialUsername(payload["username"] as string);
      }

      // If server echoed user, keep flags in sync
      const savedUser = (j as any)?.user as Profile | undefined;
      if (savedUser) {
        setStoreLocationUrl(savedUser.storeLocationUrl ?? "");
        setEmailVerified(
          Boolean(
            (savedUser as any)?.emailVerified || (savedUser as any)?.email_verified,
          ),
        );
        setStoreVerified(Boolean((savedUser as any)?.verified));
      }

      toast.success("Profile updated!");
    } catch {
      toast.error("Network error while saving profile.");
    } finally {
      setSaving(false);
    }
  }

  const cardClass =
    "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-5 shadow-sm";

  const sectionTitleClass =
    "text-sm sm:text-base font-semibold text-[var(--text)]";

  const helpTextClass =
    "mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]";

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
    <form
      onSubmit={onSave}
      className="space-y-4 sm:space-y-6 text-[var(--text)]"
      aria-busy={saving}
    >
      {/* Account */}
      <div className={cardClass}>
        <div className="mb-2 sm:mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitleClass}>Account</h2>
          {storeVerified && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
              <span aria-hidden>✓</span>
              <span>Verified seller</span>
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              aria-invalid={!!email && !EMAIL_RE.test(email.trim().toLowerCase())}
            />

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {email ? (
                emailVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
                    <span aria-hidden>✓</span>
                    {/* IMPORTANT: keep this exact text node for Playwright exact match */}
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

            <p className={helpTextClass}>
              Changing your email may require re-verification.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={!!username && !USERNAME_RE.test(username.trim())}
              placeholder="yourname"
            />
            <p className={helpTextClass}>
              This appears on your store and listings.
            </p>
          </div>
        </div>

        {/* Password link */}
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
      </div>

      {/* Profile photo */}
      <div className={cardClass}>
        <h2 className={`mb-2 sm:mb-3 ${sectionTitleClass}`}>Profile photo</h2>
        <ProfilePhotoUploader initialImage={image} />
      </div>

      {/* Contact */}
      <div className={cardClass}>
        <h2 className={`mb-2 sm:mb-3 ${sectionTitleClass}`}>Contact</h2>
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
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
              <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">
                Normalized:{" "}
                {normalizedWa ? (
                  <span className="font-semibold text-[var(--text)]">
                    +{normalizedWa}
                  </span>
                ) : (
                  <span className="font-semibold text-[var(--text)]">
                    Invalid
                  </span>
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Location + Store link */}
      <div className={cardClass}>
        <h2 className={`mb-2 sm:mb-3 ${sectionTitleClass}`}>Location</h2>
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
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

          <div className="sm:col-span-2">
            <label className="label" htmlFor="storeLocationUrl">
              Store location (Google Maps URL)
            </label>
            <input
              id="storeLocationUrl"
              className="input"
              value={storeLocationUrl}
              onChange={(e) => setStoreLocationUrl(e.target.value)}
              placeholder="https://maps.google.com/… or https://goo.gl/maps/…"
            />
            <p className={helpTextClass}>
              This link can be shown on your listings to help buyers find your
              store or meeting point. Only Google Maps links are allowed.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <button
          type="submit"
          disabled={saving}
          className="btn-gradient-primary disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <Link href="/dashboard" className="btn-outline">
          Cancel
        </Link>
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 sm:p-5 shadow-sm">
        <h2 className="mb-1.5 sm:mb-2 text-sm sm:text-base font-semibold text-[var(--text)]">
          Danger zone
        </h2>
        <p className="mb-2.5 sm:mb-3 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
          This will permanently delete your account and all your listings. This
          action cannot be undone.
        </p>
        <DeleteAccountButton email={email} />
      </div>
    </form>
  );
}
