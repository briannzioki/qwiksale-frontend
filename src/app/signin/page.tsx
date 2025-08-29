"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import toast from "react-hot-toast";
import Link from "next/link";
import { normalizeKenyanPhone } from "@/app/lib/phone";

export default function SignInPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") || "/";

  // Email magic link
  const [emailLink, setEmailLink] = useState("");
  const [sendingLink, setSendingLink] = useState(false);

  // OTP (email OR phone) + 6-digit code
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function onGoogle() {
    // NextAuth will use NEXTAUTH_URL for the callback base
    await signIn("google", { callbackUrl });
  }

  async function onSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const em = (emailLink || "").trim().toLowerCase();
    if (!em || !em.includes("@")) {
      toast.error("Enter a valid email.");
      return;
    }
    try {
      setSendingLink(true);
      const res = await signIn("email", { email: em, redirect: false });
      if (res?.ok) {
        toast.success("Check your email for the sign-in link.");
        setEmailLink("");
      } else {
        toast.error(res?.error || "Failed to send link.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to send link.");
    } finally {
      setSendingLink(false);
    }
  }

  async function onStartOtp(e: React.MouseEvent) {
    e.preventDefault();
    const raw = (identifier || "").trim();
    if (!raw) {
      toast.error("Enter your email or Kenyan phone.");
      return;
    }

    // If it looks like a KE phone, normalize (07…/01…/+254… → 254…)
    const maybePhone = normalizeKenyanPhone(raw);
    const payload = { identifier: maybePhone ? `tel:${maybePhone}` : raw.toLowerCase() };

    try {
      setSendingCode(true);
      const r = await fetch("/api/auth/otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        throw new Error(j?.error || `Failed to send code (${r.status})`);
      }
      toast.success("We sent you a 6-digit code.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send code.");
    } finally {
      setSendingCode(false);
    }
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const raw = (identifier || "").trim();
    const digits = (code || "").trim();
    if (!raw) return toast.error("Enter your email or phone.");
    if (!/^\d{6}$/.test(digits)) return toast.error("Enter the 6-digit code.");

    const maybePhone = normalizeKenyanPhone(raw);
    const id = maybePhone ? `tel:${maybePhone}` : raw.toLowerCase();

    try {
      setVerifying(true);
      const res = await signIn("otp", {
        redirect: false,
        identifier: id,
        code: digits,
      });
      if (res?.ok && !res?.error) {
        toast.success("Signed in!");
        router.push(callbackUrl);
      } else {
        toast.error(res?.error || "Invalid code. Try again.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Sign-in failed.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-xl">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">Sign in to QwikSale</h1>
          <p className="text-sm text-white/80 dark:text-slate-300">
            Anyone can sign in with email or phone. <b>Sellers</b> will be asked to verify both.
          </p>
        </div>

        <div className="mt-6 grid gap-6">
          {/* Google */}
          <div className="card-surface p-4">
            <button
              onClick={onGoogle}
              className="w-full rounded-xl border px-4 py-3 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
              aria-label="Continue with Google"
            >
              Continue with Google
            </button>
          </div>

          {/* Email magic link */}
          <form onSubmit={onSendMagicLink} className="card-surface p-4">
            <label className="block text-sm font-semibold mb-1">Email (magic link)</label>
            <div className="flex gap-2">
              <input
                type="email"
                className="flex-1 rounded-lg border px-3 py-2"
                placeholder="you@example.com"
                value={emailLink}
                onChange={(e) => setEmailLink(e.target.value)}
              />
              <button
                type="submit"
                disabled={sendingLink}
                className="rounded-lg border px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                {sendingLink ? "Sending…" : "Send link"}
              </button>
            </div>
          </form>

          {/* Phone/Email + OTP */}
          <form onSubmit={onVerifyOtp} className="card-surface p-4 space-y-3">
            <div>
              <label className="block text-sm font-semibold mb-1">
                Phone (07… / +2547…) or Email (one-time code)
              </label>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border px-3 py-2"
                  placeholder="07XXXXXXXX or you@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <button
                  type="button"
                  onClick={onStartOtp}
                  disabled={sendingCode}
                  className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {sendingCode ? "Sending…" : "Send code"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">6-digit code</label>
              <input
                inputMode="numeric"
                maxLength={6}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D+/g, "").slice(0, 6))}
              />
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={verifying}
                className="w-full rounded-xl bg-[#161748] text-white px-4 py-2 font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {verifying ? "Signing in…" : "Sign in"}
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-400">
              Trouble signing in?{" "}
              <Link href="/auth-test" className="underline">
                Run auth test
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
