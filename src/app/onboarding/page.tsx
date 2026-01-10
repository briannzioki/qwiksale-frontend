// src/app/onboarding/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";
import { normalizeKenyanPhone } from "@/app/lib/phone";

type Profile = {
  username: string;
  whatsapp: string;
  city: string;
  country: string;
  postalCode: string;
  address: string;
};

type UsernameCheck = { valid?: boolean; available?: boolean };

function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

// 3-24; letters/digits/._; no leading/trailing sep; no doubles
const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;
const canonicalUsername = (raw: string) => raw.trim().toLowerCase();

function OnboardingPageInner() {
  const { status } = useSession();
  const sp = useSearchParams();

  // ✅ Canonical: accept both `return` and `callbackUrl` (your flows now use callbackUrl).
  const retRaw = sp.get("return") || sp.get("callbackUrl") || "/dashboard";
  const returnTo = isSafePath(retRaw) ? retRaw : "/dashboard";

  // E2E expects: /signin?callbackUrl=%2Fonboarding?return=%2Fdashboard
  const encodedOnboardingPath = encodeURIComponent("/onboarding");
  const encodedReturnTo = encodeURIComponent(returnTo);
  const signInHref = `/signin?callbackUrl=${encodedOnboardingPath}?return=${encodedReturnTo}`;

  const [form, setForm] = useState<Profile>({
    username: "",
    whatsapp: "",
    city: "",
    country: "",
    postalCode: "",
    address: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [saved, setSaved] = useState(false);

  // username availability
  const [unameStatus, setUnameStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [unameMsg, setUnameMsg] = useState<string>("");
  const unameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unameAbort = useRef<AbortController | null>(null);

  const heroClass =
    "rounded-2xl bg-gradient-to-r from-[var(--brand-navy)] via-[var(--brand-green)] to-[var(--brand-blue)] text-white shadow-soft";

  const panelClass =
    "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5 shadow-soft sm:p-5";

  const fieldLabelClass = "mb-1 block text-sm font-semibold text-[var(--text)]";

  const helperTextClass = "mt-1 text-xs leading-relaxed text-[var(--text-muted)]";

  const inputClass =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const primaryBtnClass =
    "btn-gradient-primary min-h-9 text-xs sm:text-sm disabled:opacity-60 disabled:pointer-events-none";

  const secondaryBtnClass = "btn-outline min-h-9 text-xs sm:text-sm";

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    const cleanup = () => {
      alive = false;
      ctrl.abort();
      if (unameTimer.current) clearTimeout(unameTimer.current);
      unameAbort.current?.abort();
    };

    if (status === "unauthenticated") {
      setUnauthorized(true);
      setLoading(false);
      return cleanup;
    }

    if (status !== "authenticated") {
      return cleanup;
    }

    setUnauthorized(false);

    (async () => {
      try {
        const r = await fetch("/api/me/profile", {
          cache: "no-store",
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });

        if (r.status === 401) {
          if (alive) setUnauthorized(true);
          return;
        }

        if (!r.ok) throw new Error("load failed");

        const j = await r.json();
        if (alive && j?.user) {
          setForm({
            username: j.user.username ?? "",
            whatsapp: j.user.whatsapp ?? "",
            city: j.user.city ?? "",
            country: j.user.country ?? "",
            postalCode: j.user.postalCode ?? "",
            address: j.user.address ?? "",
          });
        }
      } catch {
        // soft-fail
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return cleanup;
  }, [status]);

  const onUsernameChange = (next: string) => {
    setForm((f) => ({ ...f, username: next }));
    const raw = next;

    if (unameTimer.current) clearTimeout(unameTimer.current);

    if (!raw) {
      setUnameStatus("idle");
      setUnameMsg("");
      return;
    }

    const u = canonicalUsername(raw);
    if (!USERNAME_RE.test(u)) {
      setUnameStatus("invalid");
      setUnameMsg("3-24 chars; letters, numbers, . or _ (no .., no leading/trailing . or _).");
      return;
    }

    setUnameStatus("checking");
    setUnameMsg("Checking…");

    unameAbort.current?.abort();
    const ac = new AbortController();
    unameAbort.current = ac;

    unameTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/username/check?u=${encodeURIComponent(u)}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        const j = (await r.json().catch(() => ({}))) as UsernameCheck;

        if (!r.ok) {
          setUnameStatus("idle");
          setUnameMsg("");
          return;
        }

        if (j?.valid === false) {
          setUnameStatus("invalid");
          setUnameMsg("Invalid username.");
        } else if (j?.available === true) {
          setUnameStatus("ok");
          setUnameMsg("Available ✓");
        } else {
          setUnameStatus("taken");
          setUnameMsg("Already taken.");
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setUnameStatus("idle");
          setUnameMsg("");
        }
      }
    }, 450);
  };

  const normalizedWa = useMemo(() => {
    const raw = form.whatsapp.trim();
    if (!raw) return "";
    return normalizeKenyanPhone(raw) || "";
  }, [form.whatsapp]);

  function snapNormalizeWhatsapp() {
    if (!form.whatsapp) return;
    if (!normalizedWa) return;
    const pretty = `+${normalizedWa}`;
    if (form.whatsapp !== pretty) setForm((f) => ({ ...f, whatsapp: pretty }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || unauthorized) return;

    const username = canonicalUsername(form.username);
    if (!USERNAME_RE.test(username)) {
      toast.error("Choose a valid username.");
      return;
    }
    if (unameStatus === "taken") {
      toast.error("That username is taken.");
      return;
    }

    const waRaw = form.whatsapp.trim();
    const wa = waRaw ? normalizeKenyanPhone(waRaw) : null;
    if (waRaw && !wa) {
      toast.error("Enter a valid Kenyan WhatsApp number (07XXXXXXXX or +2547XXXXXXX).");
      return;
    }

    const payload = {
      username,
      whatsapp: wa ? wa : waRaw ? "" : null,
      city: form.city.trim() || "",
      country: form.country.trim() || "",
      postalCode: form.postalCode.trim() || "",
      address: form.address.trim() || "",
    };

    try {
      setSaving(true);
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j?.error || "Failed to save profile.");
        return;
      }
      toast.success("Profile saved!");
      setSaved(true);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="container-page bg-[var(--bg)] py-4 sm:py-6">
        <div className="mx-auto max-w-xl">
          <div className={heroClass}>
            <div className="container-page py-6 text-white sm:py-8">
              <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
                Finish your profile
              </h1>
              <p className="mt-1 text-xs text-white/80 sm:text-sm">Loading…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const unameHintClass =
    unameStatus === "ok"
      ? "text-[var(--text)]"
      : unameStatus === "taken" || unameStatus === "invalid"
        ? "text-[var(--text)]"
        : "text-[var(--text-muted)]";

  return (
    <div className="container-page bg-[var(--bg)] py-4 sm:py-6">
      <div className="mx-auto max-w-xl">
        <div className={heroClass}>
          <div className="container-page py-6 text-white sm:py-8">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
              Finish your profile
            </h1>
            <p className="mt-1 text-xs text-white/80 sm:text-sm">
              Only <b>username</b> is required now. You can add the rest later in{" "}
              <Link href="/account/profile" className="underline">
                Profile
              </Link>
              .
            </p>
          </div>
        </div>

        {unauthorized ? (
          <div role="alert" className={`mt-3 sm:mt-4 ${panelClass}`}>
            <p className="text-sm leading-relaxed text-[var(--text)]">
              Please{" "}
              <Link className="underline" href={signInHref}>
                sign in
              </Link>{" "}
              to finish onboarding.
            </p>
          </div>
        ) : null}

        {saved ? (
          <div className={`mt-3 sm:mt-4 ${panelClass}`}>
            <p className="text-sm leading-relaxed text-[var(--text)]">
              Profile saved.{" "}
              <Link href={returnTo} className="underline">
                Continue
              </Link>
            </p>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className={`mt-4 space-y-4 sm:mt-6 ${panelClass}`} noValidate>
          <div>
            <label htmlFor="username" className={fieldLabelClass}>
              Username <span className="text-[var(--text-muted)]">*</span>
            </label>
            <div className="relative">
              <input
                id="username"
                className={`${inputClass} pr-20 sm:pr-24`}
                placeholder="e.g. brian254"
                value={form.username}
                onChange={(e) => onUsernameChange(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={24}
                required
              />
              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)] sm:text-xs">
                {unameStatus === "checking" ? "Checking…" : null}
              </div>
            </div>
            <p className={`mt-1 text-xs leading-relaxed ${unameHintClass}`}>
              {unameStatus === "invalid"
                ? "3-24 letters/numbers, . or _ (no .., no leading/trailing . or _)."
                : unameStatus === "taken"
                  ? unameMsg || "Username already taken."
                  : unameStatus === "ok"
                    ? unameMsg || "Available ✓"
                    : "This will be visible on your listings and profile."}
            </p>
          </div>

          <div>
            <label htmlFor="whatsapp" className={fieldLabelClass}>
              WhatsApp (optional)
            </label>
            <input
              id="whatsapp"
              className={inputClass}
              placeholder="07XXXXXXXX or +2547XXXXXXX"
              value={form.whatsapp}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
              onBlur={snapNormalizeWhatsapp}
              inputMode="tel"
            />
            {form.whatsapp ? (
              <p className={helperTextClass}>
                Normalized:{" "}
                {normalizedWa ? (
                  <span className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
                    +{normalizedWa}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
                    Invalid
                  </span>
                )}
              </p>
            ) : (
              <p className={helperTextClass}>Buyers can reach you faster if you add WhatsApp.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className={fieldLabelClass}>
                City (optional)
              </label>
              <input
                id="city"
                className={inputClass}
                placeholder="Nairobi"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="country" className={fieldLabelClass}>
                Country (optional)
              </label>
              <input
                id="country"
                className={inputClass}
                placeholder="Kenya"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="postal" className={fieldLabelClass}>
                Postal code (optional)
              </label>
              <input
                id="postal"
                className={inputClass}
                placeholder="00100"
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                inputMode="numeric"
              />
            </div>
            <div>
              <label htmlFor="address" className={fieldLabelClass}>
                Address (optional)
              </label>
              <input
                id="address"
                className={inputClass}
                placeholder="Street, building, etc."
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={
                unauthorized ||
                saving ||
                unameStatus === "checking" ||
                unameStatus === "invalid" ||
                unameStatus === "taken"
              }
              className={primaryBtnClass}
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <Link href={returnTo} className={secondaryBtnClass}>
              Skip for now
            </Link>
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            By continuing you agree to QwikSale’s{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <OnboardingPageInner />
    </Suspense>
  );
}
