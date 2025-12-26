"use client";

// src/app/account/complete-profile/CompleteProfileClient.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import ProfilePhotoUploader from "@/app/components/account/ProfilePhotoUploader";
import { Button } from "@/app/components/Button";

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
  image?: string | null;

  verified?: boolean | null; // seller/store verification (keep)
  emailVerified?: string | null; // email verification timestamp (ISO) or null
  email_verified?: string | null; // backward-compat (if any API ever used snake_case)
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const looksLikeEmail = (e?: string) => !!e && EMAIL_RE.test(e.trim().toLowerCase());

function normalizeKePhone(raw: string): string {
  const trimmed = (raw || "").trim();
  if (/^\+254(7|1)\d{8}$/.test(trimmed)) return trimmed.replace(/^\+/, "");
  let s = trimmed.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}
const looksLikeValidKePhone = (input: string) => /^254(7|1)\d{8}$/.test(normalizeKePhone(input));

// 3–24; letters/digits/._; no leading/trailing sep; no doubles
const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;
const looksLikeValidUsername = (u: string) => USERNAME_RE.test(u);
const isSafePath = (p?: string | null): p is string => !!p && /^\/(?!\/)/.test(p);

type NameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

/* -------------------------------- Component -------------------------------- */

export default function CompleteProfileClient() {
  const sp = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();

  const ret = (() => {
    const raw = sp.get("next") || sp.get("return");
    return isSafePath(raw) ? raw : "/dashboard";
  })();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unauth, setUnauth] = useState(false);
  const [saved, setSaved] = useState(false);

  const [me, setMe] = useState<Me | null>(null);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostal] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const [nameStatus, setNameStatus] = useState<NameStatus>("idle");
  const usernameAbort = useRef<AbortController | null>(null);

  const didLoadMe = useRef(false);
  const loadAbort = useRef<AbortController | null>(null);

  const whatsappNormalized = useMemo(
    () => (whatsapp ? normalizeKePhone(whatsapp) : ""),
    [whatsapp],
  );

  const sessionUser: any = (session as any)?.user ?? null;

  // IMPORTANT: email verification is NOT "verified seller"
  const emailIsVerified = Boolean(me?.emailVerified || (me as any)?.email_verified);

  const verifyEmailHref = useMemo(() => {
    return `/account/verify-email?next=${encodeURIComponent(ret)}&auto=1`;
  }, [ret]);

  const signinHref = `/signin?callbackUrl=${encodeURIComponent(
    `/account/complete-profile?next=${encodeURIComponent(ret)}`,
  )}`;

  /* -------------------- Load profile only when authed -------------------- */
  useEffect(() => {
    // Wait for next-auth to resolve
    if (sessionStatus === "loading") return;

    // If not authed, do NOT hit /api/me at all (prevents 401 noise)
    if (sessionStatus !== "authenticated") {
      setUnauth(true);
      setLoading(false);
      return;
    }

    setUnauth(false);

    // Quick prefill from session while we fetch full profile
    try {
      const se = typeof sessionUser?.email === "string" ? sessionUser.email : "";
      const su = typeof sessionUser?.username === "string" ? sessionUser.username : "";
      if (se && !email) setEmail(se.trim());
      if (su && !username) setUsername(su.trim());
    } catch {
      /* ignore */
    }

    if (didLoadMe.current) {
      setLoading(false);
      return;
    }
    didLoadMe.current = true;

    let alive = true;
    loadAbort.current?.abort();
    const ctrl = new AbortController();
    loadAbort.current = ctrl;

    (async () => {
      try {
        const r = await fetch("/api/me/profile", {
          cache: "no-store",
          signal: ctrl.signal,
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });

        if (r.status === 401) {
          if (alive) {
            setUnauth(true);
            setLoading(false);
          }
          return;
        }

        const j = await r.json().catch(() => null);
        const u: Me | null =
          j?.user && typeof j.user === "object"
            ? (j.user as Me)
            : j && typeof j === "object" && "email" in j
              ? (j as Me)
              : null;

        if (!alive) return;

        if (!u?.email) {
          setUnauth(true);
          setLoading(false);
          return;
        }

        setMe(u);
        setEmail((u.email ?? "").trim());
        setUsername((u.username ?? "").trim());
        setWhatsapp(u.whatsapp ?? "");
        setAddress(u.address ?? "");
        setPostal(u.postalCode ?? "");
        setCity(u.city ?? "");
        setCountry(u.country ?? "");
      } catch {
        // soft-fail; keep loading false so user sees something
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

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

    if (unauth || sessionStatus !== "authenticated") {
      toast.error("Please sign in to complete your profile.");
      return;
    }

    const u = username.trim();
    const eMail = email.trim().toLowerCase();

    if (!looksLikeEmail(eMail)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (!looksLikeValidUsername(u)) {
      toast.error("Username must be 3-24 chars (letters, numbers, dot, underscore).");
      return;
    }
    if (nameStatus === "taken" || nameStatus === "invalid" || nameStatus === "checking") {
      toast.error(
        nameStatus === "checking"
          ? "Please wait for the username check…"
          : nameStatus === "taken"
            ? "That username is taken."
            : "Invalid username.",
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
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          email: eMail,
          username: u,
          whatsapp: whatsappNormalized || null,
          address: address.trim() || null,
          postalCode: postalCode.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || (j && (j as any).error)) {
        throw new Error((j as any)?.error || `Failed (${r.status})`);
      }

      toast.success("Profile saved!");
      setSaved(true); // we keep the user here; they can hit “Continue”
    } catch (err: any) {
      toast.error(err?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------- Render --------------------------------- */

  const nameHint =
    nameStatus === "available"
      ? "Looks good - available."
      : nameStatus === "taken"
        ? "That username is taken."
        : nameStatus === "invalid"
          ? "Use 3-24 chars: letters, numbers, dot, underscore."
          : nameStatus === "checking"
            ? "Checking availability…"
            : "";

  const nameHintClass =
    nameStatus === "available"
      ? "text-[var(--text)]"
      : nameStatus === "taken" || nameStatus === "invalid" || nameStatus === "error"
        ? "text-[var(--text)] font-semibold"
        : "text-[var(--text-muted)]";

  const emailInvalid = email.trim().length > 0 && !looksLikeEmail(email.trim());

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="container-page py-4 sm:py-6 text-[var(--text)] md:py-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-sm sm:p-6">
            <div className="h-5 w-40 rounded bg-[var(--skeleton)]" />
            <div className="mt-3 sm:mt-4 h-4 w-full max-w-md rounded bg-[var(--skeleton)]" />
            <div className="mt-4 sm:mt-6 space-y-3">
              <div className="h-10 w-full rounded bg-[var(--skeleton)]" />
              <div className="h-10 w-full rounded bg-[var(--skeleton)]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If guest, show sign-in prompt and STOP (no background /api/me calls).
  if (unauth) {
    return (
      <div className="container-page py-4 sm:py-6 text-[var(--text)] md:py-10">
        <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
          <div
            role="alert"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2.5 text-xs sm:text-sm text-[var(--text)] shadow-sm"
          >
            Please{" "}
            <Link
              className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 ring-focus rounded"
              href={signinHref}
            >
              sign in
            </Link>{" "}
            to complete your profile.
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-sm sm:p-6">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text)]">
              Finish setting up your account
            </h1>
            <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
              Sign in to add your username, contact details, and verify your email.
            </p>
            <div className="mt-3 sm:mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="primary">
                <Link href={signinHref}>Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={ret}>Go back</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-4 sm:py-6 text-[var(--text)] md:py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-6">
        {/* Alerts */}
        {saved && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2.5 text-xs sm:text-sm text-[var(--text)] shadow-sm">
            Profile saved.{" "}
            <Link
              href={ret}
              className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 ring-focus rounded"
            >
              Continue
            </Link>
          </div>
        )}

        {/* Main form card */}
        <form
          onSubmit={onSave}
          className="space-y-4 sm:space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-sm sm:p-6"
          noValidate
          aria-busy={saving}
        >
          {/* Intro */}
          <header className="space-y-1">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text)]">
              Finish setting up your account
            </h1>
            <p className="text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
              A clear username and contact details help buyers and sellers recognise you and get in touch quickly.
            </p>
          </header>

          {/* Account section */}
          <section className="space-y-2.5 sm:space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">Account</h2>

            {!emailIsVerified && (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-[var(--text)] shadow-sm">
                <div className="font-semibold">Verify your email</div>
                <div className="mt-0.5 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">
                  Verified accounts get better trust and unlock the verified badge where applicable.
                </div>
                <div className="mt-2.5 sm:mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="primary">
                    <Link
                      href={verifyEmailHref}
                      prefetch={false}
                      data-testid="complete-profile-verify-email"
                    >
                      Verify email
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={ret} prefetch={false}>
                      Continue without verifying
                    </Link>
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="email" className="label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => setEmail(e.target.value.trim())}
                  required
                  autoComplete="email"
                  inputMode="email"
                  disabled={saving}
                  aria-invalid={emailInvalid || undefined}
                />
                <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">
                  Changing your sign-in email may require verification.
                </p>
              </div>

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
                  aria-invalid={
                    nameStatus === "taken" || nameStatus === "invalid" ? true : undefined
                  }
                  aria-describedby="username-help username-status"
                  disabled={saving}
                  inputMode="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <p
                  id="username-help"
                  className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]"
                >
                  Shown on your listings. 3-24 chars, letters/numbers/dot/underscore.
                </p>
                {nameHint && (
                  <p
                    id="username-status"
                    className={`mt-1 text-[11px] sm:text-xs ${nameHintClass}`}
                    aria-live="polite"
                  >
                    {nameHint}
                  </p>
                )}
              </div>
            </div>

            {/* Password link (simple text link) */}
            <p className="text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">
              Need to change your password?{" "}
              <Link
                href={`/reset-password?return=${encodeURIComponent(ret)}`}
                prefetch={false}
                className="text-[var(--text)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 ring-focus rounded"
              >
                Reset password
              </Link>
              .
            </p>
          </section>

          {/* Profile photo */}
          <section className="space-y-2.5 sm:space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">Profile photo</h2>
            <p className="text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
              A clear photo helps people recognise you. You can change this any time.
            </p>
            <ProfilePhotoUploader initialImage={me?.image ?? null} />
          </section>

          {/* Contact */}
          <section className="space-y-2.5 sm:space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">Contact</h2>
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
              <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">
                Will be stored as <code className="font-mono">{whatsappNormalized || "-"}</code>.
              </p>
            </div>
          </section>

          {/* Location */}
          <section className="space-y-2.5 sm:space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">Location (optional)</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">City</label>
                <input
                  className="input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="label">Country</label>
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
                <label className="label">Postal code</label>
                <input
                  className="input"
                  value={postalCode}
                  onChange={(e) => setPostal(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="label">Address</label>
                <input
                  className="input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={saving}
                  placeholder="Street, estate, etc."
                />
              </div>
            </div>
          </section>

          {/* Actions */}
          <section className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 sm:pt-4">
            <p className="text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">
              You can update these details later from your account settings.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                size="sm"
                variant="primary"
                loading={saving}
                disabled={
                  saving ||
                  nameStatus === "checking" ||
                  nameStatus === "invalid" ||
                  !looksLikeEmail(email.trim())
                }
              >
                {saving ? "Saving…" : "Save profile"}
              </Button>
              <Button asChild type="button" size="sm" variant="outline" disabled={saving}>
                <Link href={ret} aria-disabled={saving}>
                  Skip for now
                </Link>
              </Button>
            </div>
          </section>

          <p className="sr-only" aria-live="polite">
            {saving ? "Saving profile…" : ""}
          </p>
        </form>
      </div>
    </div>
  );
}
