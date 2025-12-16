"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button } from "@/app/components/Button";

type MeProfile = {
  email: string | null;
  emailVerified?: string | null;
  email_verified?: string | null;
};

type MeProfileResponse = { user: MeProfile } | { error: string };

const isSafePath = (p?: string | null): p is string => !!p && /^\/(?!\/)/.test(p);

function onlyDigits(input: string) {
  return (input || "").replace(/\D+/g, "");
}

function normalizeCode(input: string) {
  // Keep up to 8 digits (some OTP systems use 6; don’t hard-break if you change later)
  return onlyDigits(input).slice(0, 8);
}

export default function VerifyEmailClient() {
  const sp = useSearchParams();

  const nextHref = useMemo(() => {
    const raw = sp.get("next") || sp.get("return");
    return isSafePath(raw) ? raw : "/dashboard";
  }, [sp]);

  const autoSend = useMemo(() => sp.get("auto") === "1", [sp]);

  const [loading, setLoading] = useState(true);
  const [unauth, setUnauth] = useState(false);

  const [email, setEmail] = useState<string>("");
  const [verified, setVerified] = useState(false);

  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const didAutoSend = useRef(false);
  const loadAbort = useRef<AbortController | null>(null);

  const signinHref = useMemo(() => {
    const callbackUrl = `/account/verify-email?next=${encodeURIComponent(nextHref)}${autoSend ? "&auto=1" : ""}`;
    return `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }, [nextHref, autoSend]);

  const cooldownLeft = useMemo(() => {
    const ms = Math.max(0, cooldownUntil - nowTick);
    return Math.ceil(ms / 1000);
  }, [cooldownUntil, nowTick]);

  useEffect(() => {
    if (!cooldownUntil) return;
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  async function loadMeProfile() {
    loadAbort.current?.abort();
    const ctrl = new AbortController();
    loadAbort.current = ctrl;

    try {
      const r = await fetch("/api/me/profile", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: ctrl.signal,
      });

      if (r.status === 401) {
        setUnauth(true);
        return;
      }

      const j = (await r.json().catch(() => ({}))) as MeProfileResponse;
      const u = (j as any)?.user as MeProfile | undefined;

      if (!u?.email) {
        setUnauth(true);
        return;
      }

      const isVerified = Boolean(u.emailVerified || u.email_verified);

      setEmail(u.email ?? "");
      setVerified(isVerified);
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Could not load your profile.");
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await loadMeProfile();
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      loadAbort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendCode() {
    if (sending) return;
    if (cooldownLeft > 0) return;

    setSending(true);
    try {
      const r = await fetch("/api/account/verify-email/request", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });

      const j = await r.json().catch(() => ({}));

      if (r.status === 401) {
        setUnauth(true);
        toast.error("Please sign in again.");
        return;
      }

      if (!r.ok) {
        toast.error((j as any)?.error || "Could not send code.");
        return;
      }

      setSent(true);
      setCooldownUntil(Date.now() + 30_000);
      toast.success("Verification code sent.");
    } catch {
      toast.error("Network error while sending code.");
    } finally {
      setSending(false);
    }
  }

  async function confirmCode() {
    if (confirming) return;

    const c = normalizeCode(code);
    if (!c) {
      toast.error("Enter the verification code.");
      return;
    }

    setConfirming(true);
    try {
      const r = await fetch("/api/account/verify-email/confirm", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ code: c }),
      });

      const j = await r.json().catch(() => ({}));

      if (r.status === 401) {
        setUnauth(true);
        toast.error("Please sign in again.");
        return;
      }

      if (!r.ok) {
        toast.error((j as any)?.error || "Invalid or expired code.");
        return;
      }

      setVerified(true);
      toast.success("Email verified!");

      // Refresh local view from server (keeps UI consistent)
      await loadMeProfile();
    } catch {
      toast.error("Network error while confirming code.");
    } finally {
      setConfirming(false);
    }
  }

  // Auto-send once (only if requested) after we know the user + status
  useEffect(() => {
    if (loading) return;
    if (unauth) return;
    if (!autoSend) return;
    if (verified) return;
    if (didAutoSend.current) return;

    didAutoSend.current = true;
    void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, unauth, autoSend, verified]);

  if (loading) {
    return (
      <div className="container-page py-8 md:py-10">
        <div className="mx-auto max-w-2xl">
          <div className="card-surface p-4 sm:p-6">
            <div className="h-5 w-48 rounded bg-[var(--skeleton)]" />
            <div className="mt-4 h-10 w-full rounded bg-[var(--skeleton)]" />
            <div className="mt-3 h-9 w-36 rounded bg-[var(--skeleton)]" />
          </div>
        </div>
      </div>
    );
  }

  if (unauth) {
    return (
      <div className="container-page py-8 md:py-10">
        <div className="mx-auto max-w-2xl space-y-4">
          <div
            role="alert"
            className="card-surface border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-50"
          >
            Please{" "}
            <Link className="underline" href={signinHref}>
              sign in
            </Link>{" "}
            to verify your email.
          </div>

          <div className="card-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Verify your email</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              You need to be signed in to receive a verification code.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="primary">
                <Link href={signinHref}>Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={nextHref}>Go back</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (verified) {
    return (
      <div className="container-page py-8 md:py-10">
        <div className="mx-auto max-w-2xl space-y-4">
          <div
            data-testid="verify-email-success"
            className="card-surface border border-emerald-300/70 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-50"
          >
            <div className="font-semibold">Email verified</div>
            <div className="mt-0.5 text-xs text-emerald-950/80 dark:text-emerald-50/80">
              {email ? (
                <>
                  You’re verified on <span className="font-medium">{email}</span>.
                </>
              ) : (
                "Your email is verified."
              )}
            </div>
          </div>

          <div className="card-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">You’re all set</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Continue back to where you were.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="primary">
                <Link href={nextHref}>Continue</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/account/profile">Account settings</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8 md:py-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="card-surface p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Enter your verification code</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            We’ll send a one-time code to{" "}
            <span className="font-medium text-[var(--text-strong)]">{email || "your email"}</span>. The code expires
            after a short time.
          </p>

          <div className="mt-5 grid gap-3">
            <div>
              <label htmlFor="code" className="label">
                Verification code
              </label>
              <input
                id="code"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter code"
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void confirmCode();
                  }
                }}
                aria-invalid={code.length > 0 && normalizeCode(code).length < 4 ? true : undefined}
                data-testid="verify-email-code"
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">Tip: You can paste the code directly.</p>
            </div>

            <div className="flex flex-wrap gap-2" data-testid="verify-email-request">
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={confirming}
                disabled={confirming || !normalizeCode(code)}
                onClick={() => void confirmCode()}
                data-testid="verify-email-confirm"
              >
                {confirming ? "Verifying…" : "Verify email"}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={sending}
                disabled={sending || cooldownLeft > 0}
                onClick={() => void sendCode()}
                data-testid="verify-email-send"
              >
                {cooldownLeft > 0
                  ? `Resend in ${cooldownLeft}s`
                  : sent
                    ? sending
                      ? "Sending…"
                      : "Resend code"
                    : sending
                      ? "Sending…"
                      : "Send code"}
              </Button>

              <Button asChild type="button" size="sm" variant="outline" disabled={confirming || sending}>
                <Link href={nextHref}>Cancel</Link>
              </Button>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-xs text-[var(--text-muted)]">
              If you typed the wrong email, update it from{" "}
              <Link className="underline" href="/account/profile">
                your profile
              </Link>{" "}
              then request a new code.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
