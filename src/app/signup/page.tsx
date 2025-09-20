"use client";
import { Suspense, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import toast from "react-hot-toast";

/* ----------------------------- helpers ----------------------------- */
function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

function clearStaleCallbackCookies() {
  if (typeof document === "undefined") return;

  const names = [
    "__Secure-next-auth.callback-url",
    "next-auth.callback-url",
  ];

  const host = location.hostname;
  const domains = new Set<string | undefined>([undefined, host]);

  const parts = host.split(".");
  if (parts.length >= 2) {
    const apex = "." + parts.slice(-2).join(".");
    domains.add(apex);
    domains.add(".qwiksale.sale");
  }

  const common = `; Path=/; Max-Age=0; SameSite=Lax${
    location.protocol === "https:" ? "; Secure" : ""
  }`;

  for (const name of names) {
    for (const d of domains) {
      document.cookie = `${name}=deleted${common}${d ? `; Domain=${d}` : ""}`;
    }
  }
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
    "This email may already exist or the credentials are invalid. If you signed up with Google, use â€œContinue with Googleâ€.",
  OAuthAccountNotLinked:
    "This email is already linked to another login method. Use your original sign-in method.",
};

/* ----------------------------- component --------------------------- */
function SignUpPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const returnToRaw = sp.get("callbackUrl");
  const returnTo = isSafePath(returnToRaw) ? returnToRaw : "/account/profile";

  const urlError = sp.get("error");
  const friendlyError = useMemo(
    () => (urlError ? ERR_COPY[urlError] ?? "Sign-up failed. Please try again." : null),
    [urlError]
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState<"creds" | "google" | null>(null);

  useEffect(() => {
    clearStaleCallbackCookies();
  }, []);

  useEffect(() => {
    if (friendlyError) toast.error(friendlyError);
  }, [friendlyError]);

  function validate(): string | null {
    if (!email) return "Enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    const v = validate();
    if (v) return toast.error(v);

    try {
      setWorking("creds");
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: returnTo,
      });
      if (!res || res.error) {
        toast.error(
          res?.error ||
            "Sign-up failed. Try a different email or use â€œContinue with Googleâ€."
        );
        return;
      }
      toast.success("Welcome to QwikSale! ðŸŽ‰");
      router.replace(returnTo);
    } finally {
      setWorking(null);
    }
  }

  async function onGoogle() {
    if (working) return;
    setWorking("google");
    try {
      await signIn("google", { callbackUrl: returnTo });
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

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-2xl">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#161748] via-[#1d2b64] to-[#0b1220] p-8 text-white shadow-xl ring-1 ring-white/10">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Create your QwikSale account
          </h1>
          <p className="mt-2 max-w-prose text-white/90">
            Buy & sell with confidence across Kenya. It takes less than a minute.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/85">
            <Badge icon="ðŸ”’">Secure & private</Badge>
            <Badge icon="âš¡">Fast posting</Badge>
            <Badge icon="âœ…">Verified listings</Badge>
            <Badge icon="ðŸ’¬">Direct chat</Badge>
          </div>
        </div>

        {friendlyError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            {friendlyError}
          </div>
        ) : null}

        <div className="mt-8 grid gap-6">
          <div className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={onGoogle}
              disabled={!!working}
              className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold hover:bg-gray-50 active:scale-[.99] dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-60"
              aria-label="Continue with Google"
              type="button"
            >
              <GoogleIcon className="h-5 w-5" />
              {working === "google" ? "Opening Googleâ€¦" : "Continue with Google"}
            </button>
            <p className="mt-2 text-center text-xs text-gray-500 dark:text-slate-400">
              Weâ€™ll never post without your permission.
            </p>
          </div>

          <div className="relative my-2 flex items-center justify-center">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-slate-800" />
            <span className="absolute -top-3 bg-white px-3 text-xs text-gray-500 dark:bg-slate-950 dark:text-slate-400">
              or use email
            </span>
          </div>

          <form
            onSubmit={onCreate}
            className="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Email</span>
                <input
                  type="email"
                  className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-brandBlue/40 dark:border-slate-700 dark:bg-slate-950"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <span className="mt-1 block text-xs text-gray-500 dark:text-slate-400">
                  Weâ€™ll send important notifications here.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-xl border px-3 py-2 pr-12 outline-none focus:ring-2 focus:ring-brandBlue/40 dark:border-slate-700 dark:bg-slate-950"
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pwBarPct < 35
                          ? "bg-red-400"
                          : pwBarPct < 65
                          ? "bg-yellow-400"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${pwBarPct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                    Strength: {pwStrength}
                  </div>
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Confirm password</span>
                <input
                  type="password"
                  className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-brandBlue/40 dark:border-slate-700 dark:bg-slate-950"
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>

              <button
                type="submit"
                disabled={!!working}
                className="mt-1 w-full rounded-xl bg-[#161748] px-4 py-3 font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[.99] disabled:opacity-60"
              >
                {working === "creds" ? "Creating accountâ€¦" : "Create account"}
              </button>

              <p className="text-xs text-gray-600 dark:text-slate-400">
                By creating an account, you agree to QwikSaleâ€™s{" "}
                <Link className="underline underline-offset-2" href="/terms">
                  Terms
                </Link>{" "}
                and{" "}
                <Link className="underline underline-offset-2" href="/privacy">
                  Privacy Policy
                </Link>
                .
              </p>

              <p className="text-xs text-gray-600 dark:text-slate-400">
                Already have an account?{" "}
                <Link className="underline underline-offset-2" href="/signin">
                  Sign in
                </Link>
              </p>
            </div>
          </form>

          <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold">Why people stay with QwikSale</h2>
            <ul className="mt-3 grid gap-3 text-sm text-gray-700 dark:text-slate-300 md:grid-cols-2">
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

function Badge({ children, icon }: { children: React.ReactNode; icon: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] ring-1 ring-white/15 backdrop-blur">
      <span aria-hidden>{icon}</span>
      {children}
    </span>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...props} aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.826 32.599 29.28 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.152 7.961 3.039l5.657-5.657C33.64 6.053 28.999 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.817C14.48 16.064 18.883 14 24 14c3.059 0 5.842 1.152 7.961 3.039l5.657-5.657C33.64 6.053 28.999 4 24 4 16.318 4 9.657 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.227 0 9.941-1.997 13.515-5.261l-6.231-5.274C29.24 34.737 26.747 36 24 36c-5.255 0-9.79-3.381-11.396-8.078l-6.52 5.02C9.386 39.63 16.13 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-1.151 3.247-3.557 5.833-6.519 7.382l.003-.002 6.231 5.274C37.617 38.079 40 32.666 40 27c0-2.356-.389-4.621-1.111-6.917z" />
    </svg>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 text-brandBlue" fill="currentColor" aria-hidden>
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
