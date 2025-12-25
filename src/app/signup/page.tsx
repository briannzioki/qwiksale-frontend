// src/app/signup/page.tsx
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
import { signIn } from "next-auth/react";
import toast from "react-hot-toast";
import { setReferralCookie } from "@/app/lib/referral-cookie";

/* ----------------------------- helpers ----------------------------- */
function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
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

/* ----------------------------- component --------------------------- */
function SignUpPageInner() {
  const sp = useSearchParams();

  // Prefer explicit `return` param (e.g. ?return=/dashboard), then fall back to callbackUrl.
  const returnToRaw = sp.get("return") || sp.get("callbackUrl");
  const returnTo = isSafePath(returnToRaw) ? returnToRaw : "/account/profile";

  const urlError = sp.get("error");
  const friendlyError = useMemo(
    () =>
      urlError
        ? ERR_COPY[urlError] ?? "Sign-up failed. Please try again."
        : null,
    [urlError],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState<"creds" | "google" | null>(null);

  const didStoreRef = useRef(false);

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

  function validate(): string | null {
    if (!email) return "Enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return "Enter a valid email.";
    if (password.length < 6)
      return "Password must be at least 6 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (working) return;

    const v = validate();
    if (v) {
      toast.error(v);
      return;
    }

    // Delegate navigation to NextAuth (no client router)
    setWorking("creds");
    await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      callbackUrl: returnTo,
      redirect: true,
    });
    setWorking(null);
  }

  async function onGoogle() {
    if (working) return;
    setWorking("google");
    await signIn("google", { callbackUrl: returnTo, redirect: true });
    setWorking(null);
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

  return (
    <div className="container-page py-4 text-[var(--text)] sm:py-8">
      <div className="mx-auto max-w-2xl">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft dark:shadow-none">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[var(--bg)] opacity-10 blur-3xl" />
          <div className="container-page py-5 text-white sm:py-8">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
              Create your QwikSale account
            </h1>
            <p className="mt-1 text-[11px] leading-relaxed text-white/80 sm:text-sm">
              Buy & sell with confidence across Kenya. It takes less than a
              minute.
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

        <div className="mt-5 grid gap-4 sm:mt-8 sm:gap-6">
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

          <div className="relative my-1.5 flex items-center justify-center sm:my-2">
            <div className="h-px w-full bg-[var(--border-subtle)]" />
            <span className="absolute -top-2.5 bg-[var(--bg)] px-3 text-xs text-[var(--text-muted)]">
              or use email
            </span>
          </div>

          <form
            onSubmit={onCreate}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft transition hover:shadow-sm sm:p-6"
            noValidate
          >
            <div className="space-y-3 sm:space-y-4">
              {/* Email */}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--text)] sm:text-sm">
                  Email
                </span>
                <input
                  type="email"
                  className={[
                    "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2",
                    "text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none",
                    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  ].join(" ")}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">
                  We’ll send important notifications here.
                </span>
              </label>

              {/* Password */}
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
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className={[
                      "absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs",
                      "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
                      "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                    ].join(" ")}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                    <div
                      className={[
                        "h-full rounded-full bg-[var(--text)] transition-all",
                        pwBarPct < 35
                          ? "opacity-30"
                          : pwBarPct < 65
                            ? "opacity-55"
                            : "opacity-80",
                      ].join(" ")}
                      style={{ width: `${pwBarPct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    Strength: {pwStrength}
                  </div>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label
                  htmlFor="signup-confirm-password"
                  className="mb-1 block text-xs font-semibold text-[var(--text)] sm:text-sm"
                >
                  Confirm password
                </label>
                <input
                  id="signup-confirm-password"
                  type="password"
                  className={[
                    "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2",
                    "text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none",
                    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  ].join(" ")}
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={!!working}
                className="btn-gradient-primary mt-1 w-full text-sm active:scale-[.99] disabled:opacity-60 sm:text-base"
              >
                {working === "creds" ? "Creating account…" : "Create account"}
              </button>

              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                By creating an account, you agree to QwikSale’s{" "}
                <Link
                  className="text-[var(--text)] underline underline-offset-2"
                  href="/terms"
                  prefetch={false}
                >
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
            <h2 className="text-sm font-semibold text-[var(--text)] sm:text-base">
              Why people stay with QwikSale
            </h2>
            <ul className="mt-3 grid gap-2 text-[13px] leading-relaxed text-[var(--text-muted)] sm:gap-3 sm:text-sm md:grid-cols-2">
              <li className="flex items-start gap-2">
                <Spark /> Smart visibility: verified listings get prime
                placement.
              </li>
              <li className="flex items-start gap-2">
                <Spark /> Safe contact: your details stay private until you
                choose.
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
    <svg
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 text-[var(--text-muted)]"
      fill="currentColor"
      aria-hidden
    >
      <path d="M10 2l1.8 4.2L16 8l-4.2 1.8L10 14l-1.8-4.2L4 8l4.2-1.8L10 2z" />
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
