"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";

function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

const ERR_COPY: Record<string, string> = {
  CredentialsSignin:
    "Email or password is incorrect. If you registered with Google, use “Continue with Google”.",
  OAuthSignin: "We couldn't start Google sign-in. Please try again.",
  OAuthCallback: "Google sign-in failed. Please try again.",
  OAuthAccountNotLinked:
    "This email is already linked to another login method. Use your original sign-in method.",
  AccessDenied: "Access denied for this account.",
  Configuration: "Auth is temporarily misconfigured. Please try again shortly.",
  CallbackRouteError: "Sign-in callback failed. Please retry.",
};

function SignInPageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const returnToRaw = sp.get("callbackUrl");
  const returnTo = isSafePath(returnToRaw) ? returnToRaw : "/";

  const urlError = sp.get("error");
  const friendlyError = useMemo(
    () => (urlError ? ERR_COPY[urlError] ?? "Sign-in failed. Please try again." : null),
    [urlError]
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [caps, setCaps] = useState(false);
  const [working, setWorking] = useState<"creds" | "google" | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("auth:lastEmail");
      if (saved) setEmail(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (email) localStorage.setItem("auth:lastEmail", email);
    } catch {}
  }, [email]);

  useEffect(() => {
    if (friendlyError) toast.error(friendlyError);
  }, [friendlyError]);

  function safeLower(s: string) {
    return s.trim().toLowerCase();
  }

  async function onCreds(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Enter email and password.");
      return;
    }
    try {
      setWorking("creds");
      const res = await signIn("credentials", {
        email: safeLower(email),
        password,
        redirect: false,
      });
      if (!res || res.error) {
        const msg = ERR_COPY[res?.error ?? ""] ?? res?.error ?? "Sign-in failed.";
        toast.error(msg);
        return;
      }
      toast.success("Welcome back!");
      router.replace(returnTo);
    } finally {
      setWorking(null);
    }
  }

  async function onGoogle() {
    setWorking("google");
    try {
      await signIn("google", { callbackUrl: returnTo });
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl p-6 text-white shadow-soft bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
          <h1 className="text-2xl md:text-3xl font-extrabold">Sign in to QwikSale</h1>
          <p className="mt-1 text-white/85">
            Use your email & password, or continue with Google.
          </p>
        </div>

        {friendlyError ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
          >
            {friendlyError}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6">
          <form
            onSubmit={onCreds}
            className="rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="space-y-3">
              <div>
                <label htmlFor="email" className="label font-semibold">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  inputMode="email"
                />
              </div>
              <div>
                <label htmlFor="password" className="label font-semibold">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    className="input pr-24"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
                    autoComplete="current-password"
                    required
                    minLength={6}
                    aria-describedby="password-help"
                  />
                  <button
                    type="button"
                    className="btn-outline absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs"
                    onClick={() => setShowPwd((s) => !s)}
                    aria-pressed={showPwd}
                    aria-label={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? "Hide" : "Show"}
                  </button>
                </div>
                <div id="password-help" className="mt-1 flex items-center gap-3">
                  <p className="text-xs text-gray-600 dark:text-slate-400">Minimum 6 characters.</p>
                  {caps && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">
                      Caps Lock is ON
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={!!working}
                aria-busy={working === "creds"}
                className="btn-gradient-primary mt-2 w-full"
              >
                {working === "creds" ? "Signing in…" : "Sign in"}
              </button>

              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
                <span>
                  New here?{" "}
                  <Link href="/signup" className="underline underline-offset-2">
                    Create an account
                  </Link>
                </span>
                <Link href="/reset-password" className="underline underline-offset-2">
                  Forgot password?
                </Link>
              </div>
            </div>
          </form>

          <div className="rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={onGoogle}
              disabled={!!working}
              aria-busy={working === "google"}
              className="btn-outline w-full py-3"
              aria-label="Continue with Google"
              type="button"
            >
              {working === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
            <p className="mt-2 text-[12px] text-gray-500 dark:text-slate-400">
              By continuing, you agree to QwikSale’s{" "}
              <Link className="underline" href="/terms">
                Terms
              </Link>{" "}
              and{" "}
              <Link className="underline" href="/privacy">
                Privacy Policy
              </Link>
              .
            </p>
            <div className="mt-3 text-[12px] text-gray-500 dark:text-slate-400">
              <span className="opacity-80">Returning from a protected page?</span>{" "}
              You’ll be sent back to <code className="font-mono">{returnTo}</code> after sign-in.
            </div>
          </div>

          <div className="text-center text-xs text-gray-600 dark:text-slate-400">
            Prefer to browse first?{" "}
            <Link href="/" className="underline underline-offset-2">
              Continue as guest
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <SignInPageInner />
    </Suspense>
  );
}
