// src/app/signin/page.tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(""); // 07XXXXXXXX or +2547...
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");

  async function sendOtp(id: string) {
    const r = await fetch("/api/auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: id }),
    });
    if (r.ok) setOtpSent(true);
  }

  return (
    <div className="max-w-xl mx-auto my-10 card-surface p-6">
      <h1 className="text-2xl font-bold mb-4">Sign in to QwikSale</h1>

      {/* Google */}
      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="w-full rounded-lg border px-4 py-2 mb-4 hover:bg-gray-50 dark:hover:bg-slate-800"
      >
        Continue with Google
      </button>

      {/* Email magic link */}
      <div className="mt-4">
        <label className="block text-sm font-medium mb-1">Email (magic link)</label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border px-3 py-2"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            onClick={() => signIn("email", { email, callbackUrl: "/" })}
            className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Send link
          </button>
        </div>
      </div>

      {/* Phone OR email OTP */}
      <div className="mt-6">
        <label className="block text-sm font-medium mb-1">
          Phone (07XXXXXXXX / +2547…) or Email (code)
        </label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border px-3 py-2"
            placeholder="07XXXXXXXX or you@example.com"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {!otpSent ? (
            <button
              onClick={() => sendOtp(phone)}
              className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Send code
            </button>
          ) : (
            <button
              onClick={() => setOtpSent(false)}
              className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Change
            </button>
          )}
        </div>

        {otpSent && (
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-lg border px-3 py-2"
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              onClick={() =>
                signIn("otp", { identifier: phone, code, redirect: true, callbackUrl: "/" })
              }
              className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Verify & sign in
            </button>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-500">
        To <b>sell</b> on QwikSale you’ll need <b>both a verified email and a phone number</b>.
        We’ll ask you to complete your profile if anything is missing.
      </p>
    </div>
  );
}
