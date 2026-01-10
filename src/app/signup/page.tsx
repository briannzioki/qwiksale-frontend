"use client";

import {
  Suspense,
  useMemo,
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { setReferralCookie } from "@/app/lib/referral-cookie";

/* ----------------------------- helpers ----------------------------- */
function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strengthLabel(pw: string) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong", "Excellent"];
  return labels[Math.min(score, labels.length - 1)];
}

const ERR_COPY: Record<string, string> = {
  CredentialsSignin:
    'This email may already exist or the credentials are invalid. If you signed up with Google, use “Continue with Google”.',
  OAuthAccountNotLinked:
    "This email is already linked to another login method. Use your original sign-in method.",
};

const REF_CODE_RE = /^[A-Za-z0-9._-]{3,64}$/;

function buildOnboardingHref(returnTo: string) {
  const qs = new URLSearchParams();
  qs.set("callbackUrl", returnTo);
  return `/onboarding?${qs.toString()}`;
}

/* ----------------------------- component --------------------------- */
function SignUpPageInner() {
  const sp = useSearchParams();
  const { data: session, status } = useSession();

  // Prefer explicit `return` param (e.g. ?return=/dashboard), then fall back to callbackUrl.
  const returnToRaw = sp.get("return") || sp.get("callbackUrl");
  const returnTo = isSafePath(returnToRaw) ? returnToRaw : "/account/profile";

  const urlError = sp.get("error");
  const friendlyError = useMemo(
    () => (urlError ? ERR_COPY[urlError] ?? "Sign-up failed. Please try again." : null),
    [urlError],
  );

  const authedEmail = safeTrim((session?.user as any)?.email).toLowerCase();
  const isAuthed = status === "authenticated" && !!authedEmail;

  // We return here after Google OAuth with ?from=google.
  const fromGoogle =
    (sp.get("from") || "").toLowerCase() === "google" ||
    (sp.get("provider") || "").toLowerCase() === "google" ||
    (sp.get("oauth") || "").toLowerCase() === "google";

  const [email, setEmail] = useState<string>(() => "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState<"creds" | "google" | "link" | null>(null);

  const didStoreRef = useRef(false);
  const didPrefill = useRef(false);

  useEffect(() => {
    if (friendlyError) toast.error(friendlyError);
  }, [friendlyError]);

  useEffect(() => {
    if (didStoreRef.current) return;

    const raw = sp.get("ref");
    if (!raw) return;

    const code = raw.trim();
    if (!REF_CODE_RE.test(code)) return;

    didStoreRef.current = true;

    try {
      const maybe: any = (setReferralCookie as any)(code);
      if (maybe && typeof maybe?.then === "function") {
        (maybe as Promise<unknown>).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, [sp]);

  useEffect(() => {
    // Prefill email from session after Google OAuth (or any auth), no navigation.
    if (didPrefill.current) return;
    if (!isAuthed || !authedEmail) return;

    didPrefill.current = true;
    setEmail(authedEmail);
  }, [isAuthed, authedEmail]);

  function validate(): string | null {
    const em = safeTrim(email).toLowerCase();
    if (!em) return "Enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return "Enter a valid email.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function setPasswordForAuthedUser(): Promise<void> {
    const v = validate();
    if (v) {
      toast.error(v);
      return;
    }

    setWorking("link");
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
        credentials: "same-origin",
        body: JSON.stringify({ password, confirm }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        const msg =
          typeof j?.error === "string" ? j.error : "Could not set password. Please try again.";
        toast.error(msg);
        setWorking(null);
        return;
      }

      window.location.href = buildOnboardingHref(returnTo);
    } catch {
      toast.error("Could not set password. Please try again.");
      setWorking(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (working) return;

    // If already signed in (typically via Google), link a password and continue.
    if (isAuthed) {
      await setPasswordForAuthedUser();
      return;
    }

    const v = validate();
    if (v) {
      toast.error(v);
      return;
    }

    setWorking("creds");
    try {
      await signIn("credentials", {
        email: safeTrim(email).toLowerCase(),
        password,
        callbackUrl: buildOnboardingHref(returnTo),
        redirect: true,
      });
    } finally {
      setWorking(null);
    }
  }

  async function onGoogle() {
    if (working) return;

    // Return to /signup after OAuth so user can set a password (pre-filled from session).
    const backToSignup = `/signup?from=google&return=${encodeURIComponent(returnTo)}`;

    setWorking("google");
    try {
      await signIn("google", { callbackUrl: backToSignup, redirect: true });
    } finally {
      setWorking(null);
    }
  }

  const pwStrength = strengthLabel(password);
  const pwBarPct =
    pwStrength === "Too short"
      ? 10
      : pwStrength === "Weak"
        ? 25
        : pwStrength === "Okay"
          ? 45
          : pwStrength === "Good"
            ? 65
            : pwStrength === "Strong"
              ? 85
              : 100;

  const lockEmail = isAuthed && !!authedEmail;

  const ctaLabel = isAuthed ? "Set password & continue" : "Create account";
  const ctaBusy =
    working === "link" ? "Saving password…" : working === "creds" ? "Creating account…" : ctaLabel;

  return (
    <div className="container-page py-4 text-[var(--text)] sm:py-8">
      <div className="mx-auto max-w-2xl">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--brand-navy)] via-[var(--brand-green)] to-[var(--brand-blue)] text-white shadow-soft dark:shadow-none">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[var(--bg)] opacity-10 blur-3xl" />
          <div className="container-page py-5 text-white sm:py-8">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
              Create your QwikSale account
            </h1>
            <p className="mt-1 text-[11px] leading-relaxed text-white/80 sm:text-sm">
              Buy & sell with confidence across Kenya. It takes less than a minute.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/85 sm:mt-4 sm:gap-3">
              <Badge icon="🔒">Secure & private</Badge>
              <Badge icon="⚡">Fast posting</Badge>
              <Badge icon="✅">Verified listings</Badge>
              <Badge icon="💬">Direct chat</Badge>
            </div>
          </div>
        </div>

        {friendlyError ? (
          <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-sm font-medium text-[var(--text)] shadow-sm sm:mt-4 sm:px-4 sm:py-3">
            {friendlyError}
          </div>
        ) : null}

        {isAuthed ? (
          <section
            className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:mt-6 sm:p-6"
            aria-label="Finish account setup"
          >
            <h2 className="text-sm font-semibold text-[var(--text)] sm:text-base">Finish setup</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
              You’re signed in as{" "}
              <span className="font-semibold text-[var(--text)]">{authedEmail}</span>
              {fromGoogle ? " via Google." : "."} Create a password to enable email & password sign-in, then we’ll send
              you to onboarding.
            </p>
          </section>
        ) : null}

        <div className="mt-5 grid gap-4 sm:mt-8 sm:gap-6">
          {!isAuthed ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft transition hover:shadow-sm sm:p-5">
              <button
                onClick={onGoogle}
                disabled={!!working}
                className={[
                  "flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)]",
                  "bg-[var(--bg-elevated)] px-4 py-3 text-xs font-semibold text-[var(--text)] sm:text-sm",
                  "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  "disabled:opacity-60",
                ].join(" ")}
                aria-label="Continue with Google"
                type="button"
              >
                <GoogleIcon className="h-5 w-5" />
                {working === "google" ? "Opening Google…" : "Continue with Google"}
              </button>
              <p className="mt-2 text-center text-xs leading-relaxed text-[var(--text-muted)]">
                We’ll never post without your permission.
              </p>
            </div>
          ) : null}

          {!isAuthed ? (
            <div className="relative my-1.5 flex items-center justify-center sm:my-2">
              <div className="h-px w-full bg-[var(--border-subtle)]" />
              <span className="absolute -top-2.5 bg-[var(--bg)] px-3 text-xs text-[var(--text-muted)]">
                or use email
              </span>
            </div>
          ) : null}

          <form
            onSubmit={onCreate}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft transition hover:shadow-sm sm:p-6"
            noValidate
            aria-label="Create account or set password"
          >
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label
                  htmlFor="signup-email"
                  className="mb-1 block text-xs font-semibold text-[var(--text)] sm:text-sm"
                >
                  Email
                </label>
                <input
                  id="signup-email"
                  data-testid="signup-email"
                  type="email"
                  className={[
                    "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2",
                    "text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none",
                    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                    lockEmail ? "opacity-90" : "",
                  ].join(" ")}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  readOnly={lockEmail}
                  aria-readonly={lockEmail ? "true" : "false"}
                />
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  {lockEmail
                    ? "This email is from your signed-in Google account."
                    : "We’ll send important notifications here."}
                </p>
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="mb-1 block text-xs font-semibold text-[var(--text)] sm:text-sm"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    data-testid="signup-password"
                    type={showPassword ? "text" : "password"}
                    className={[
                      "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 pr-12",
                      "text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none",
                      "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                    ].join(" ")}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                    disabled={!!working}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className={[
                      "absolute right-1.5 top-1/2 -translate-y-1/2",
                      "inline-flex h-9 w-9 items-center justify-center rounded-lg",
                      "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
                      "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                      "active:scale-[.99]",
                    ].join(" ")}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-5 w-5" aria-hidden />
                    ) : (
                      <EyeIcon className="h-5 w-5" aria-hidden />
                    )}
                  </button>
                </div>

                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                    <div
                      className={[
                        "h-full rounded-full bg-[var(--text)] transition-all",
                        pwBarPct < 35 ? "opacity-30" : pwBarPct < 65 ? "opacity-55" : "opacity-80",
                      ].join(" ")}
                      style={{ width: `${pwBarPct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    Strength: {pwStrength}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-confirm-password"
                  className="mb-1 block text-xs font-semibold text-[var(--text)] sm:text-sm"
                >
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="signup-confirm-password"
                    data-testid="signup-confirm-password"
                    type={showPassword ? "text" : "password"}
                    className={[
                      "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 pr-12",
                      "text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none",
                      "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                    ].join(" ")}
                    placeholder="Repeat your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                    disabled={!!working}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className={[
                      "absolute right-1.5 top-1/2 -translate-y-1/2",
                      "inline-flex h-9 w-9 items-center justify-center rounded-lg",
                      "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
                      "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                      "active:scale-[.99]",
                    ].join(" ")}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-5 w-5" aria-hidden />
                    ) : (
                      <EyeIcon className="h-5 w-5" aria-hidden />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={!!working}
                className="btn-gradient-primary mt-1 w-full text-sm active:scale-[.99] disabled:opacity-60 sm:text-base"
                data-testid="signup-set-password-cta"
              >
                {ctaBusy}
              </button>

              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                By continuing, you agree to QwikSale’s{" "}
                <Link className="text-[var(--text)] underline underline-offset-2" href="/terms" prefetch={false}>
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  className="text-[var(--text)] underline underline-offset-2"
                  href="/privacy"
                  prefetch={false}
                >
                  Privacy Policy
                </Link>
                .
              </p>

              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Already have an account?{" "}
                <Link
                  className="text-[var(--text)] underline underline-offset-2"
                  href={`/signin?callbackUrl=${encodeURIComponent(returnTo)}`}
                  prefetch={false}
                >
                  Log in
                </Link>
              </p>
            </div>
          </form>

          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-6">
            <h2 className="text-sm font-semibold text-[var(--text)] sm:text-base">Why people stay with QwikSale</h2>
            <ul className="mt-3 grid gap-2 text-[13px] leading-relaxed text-[var(--text-muted)] sm:gap-3 sm:text-sm md:grid-cols-2">
              <li className="flex items-start gap-2">
                <Spark /> Smart visibility: verified listings get prime placement.
              </li>
              <li className="flex items-start gap-2">
                <Spark /> Safe contact: your details stay private until you choose.
              </li>
              <li className="flex items-start gap-2">
                <Spark /> Local deals first: find buyers & sellers near you.
              </li>
              <li className="flex items-start gap-2">
                <Spark /> No spam policy: quick reporting & rapid action.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Badge({ children, icon }: { children: ReactNode; icon: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text)] shadow-sm">
      <span aria-hidden>{icon}</span>
      {children}
    </span>
  );
}

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...props} aria-hidden>
      <path
        fill="currentColor"
        d="M43.611 20.083H42V20H24v8h11.303C33.826 32.599 29.28 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.152 7.961 3.039l5.657-5.657C33.64 6.053 28.999 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"
      />
      <path
        fill="currentColor"
        d="M6.306 14.691l6.571 4.817C14.48 16.064 18.883 14 24 14c3.059 0 5.842 1.152 7.961 3.039l5.657-5.657C33.64 6.053 28.999 4 24 4 16.318 4 9.657 8.337 6.306 14.691z"
      />
      <path
        fill="currentColor"
        d="M24 44c5.227 0 9.941-1.997 13.515-5.261l-6.231-5.274C29.24 34.737 26.747 36 24 36c-5.255 0-9.79-3.381-11.396-8.078l-6.52 5.02C9.386 39.63 16.13 44 24 44z"
      />
      <path
        fill="currentColor"
        d="M43.611 20.083H42V20H24v8h11.303c-1.151 3.247-3.557 5.833-6.519 7.382l.003-.002 6.231 5.274C37.617 38.079 40 32.666 40 27c0-2.356-.389-4.621-1.111-6.917z"
      />
    </svg>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 text-[var(--text-muted)]" fill="currentColor" aria-hidden>
      <path d="M10 2l1.8 4.2L16 8l-4.2 1.8L10 14l-1.8-4.2L4 8l4.2-1.8L10 2z" />
    </svg>
  );
}

function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M10.6 10.6a2.5 2.5 0 0 0 2.8 2.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 5.4A9.6 9.6 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.6 6.6C3.9 8.6 2.5 12 2.5 12s3.5 7 9.5 7a9.7 9.7 0 0 0 4.3-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <SignUpPageInner />
    </Suspense>
  );
}
