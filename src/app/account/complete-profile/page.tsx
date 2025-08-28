"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

export default function CompleteProfile() {
  const sp = useSearchParams();
  const router = useRouter();
  const { data } = useSession();

  const returnTo = sp.get("return") || "/sell";

  // We use "username" because the API expects it
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // local UI state
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data?.user) {
      setEmail(data.user.email || "");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPhone((data.user as any).phone || "");
      setUsername((data.user.name || "").replace(/\s+/g, "").toLowerCase()); // prefill
    }
  }, [data]);

  async function save() {
    setSaving(true);
    setErr(null);
    const r = await fetch("/api/account/complete-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, phone }),
    });
    if (r.ok) {
      router.replace(returnTo);
    } else {
      const j = await r.json().catch(() => ({}));
      setErr(j?.error || "Failed to save.");
    }
    setSaving(false);
  }

  return (
    <div className="max-w-xl mx-auto my-10 card-surface p-6">
      <h1 className="text-2xl font-bold mb-2">Complete your profile</h1>
      <p className="text-sm text-gray-500 mb-4">
        To list items for sale you must have both an email and a phone number.
      </p>

      {err && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Username */}
      <label className="block text-sm font-medium mt-3 mb-1">Username</label>
      <input
        className="w-full rounded-lg border px-3 py-2"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="your-username"
      />

      {/* Email with magic-link verify */}
      <label className="block text-sm font-medium mt-4 mb-1">Email</label>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <button
          onClick={() =>
            signIn("email", { email, callbackUrl: "/account/complete-profile" })
          }
          className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          Send link
        </button>
      </div>

      {/* Phone with OTP verify (no signIn here!) */}
      <label className="block text-sm font-medium mt-4 mb-1">Phone</label>
      <PhoneVerify phone={phone} onChange={setPhone} />

      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg border px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save & continue"}
        </button>
      </div>
    </div>
  );
}

function PhoneVerify({
  phone,
  onChange,
}: {
  phone: string;
  onChange: (v: string) => void;
}) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setMsg(null);
    const r = await fetch("/api/auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: phone }),
    });
    if (r.ok) {
      setSent(true);
      setMsg("Code sent. Check SMS/console.");
    } else {
      const j = await r.json().catch(() => ({}));
      setMsg(j?.error || "Failed to send code.");
    }
  }

  async function verify() {
    setMsg(null);
    const r = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: phone, code }),
    });
    if (r.ok) {
      setMsg("Phone verified ✅");
    } else {
      const j = await r.json().catch(() => ({}));
      setMsg(j?.error || "Invalid code.");
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border px-3 py-2"
          placeholder="07XXXXXXXX or +2547…"
          value={phone}
          onChange={(e) => onChange(e.target.value)}
        />
        {!sent ? (
          <button
            onClick={send}
            className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Send code
          </button>
        ) : (
          <button
            onClick={() => setSent(false)}
            className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Change
          </button>
        )}
      </div>

      {sent && (
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-lg border px-3 py-2"
            placeholder="Enter 6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            onClick={verify}
            className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Verify
          </button>
        </div>
      )}

      {msg && <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">{msg}</p>}
    </>
  );
}
