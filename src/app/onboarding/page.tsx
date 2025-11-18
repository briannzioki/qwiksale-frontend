// src/app/onboarding/page.tsx
"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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

// 3–24; letters/digits/._; no leading/trailing sep; no doubles
const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;
const canonicalUsername = (raw: string) => raw.trim().toLowerCase();

function OnboardingPageInner() {
  const { status } = useSession();
  const sp = useSearchParams();

  const retRaw = sp.get("return") || sp.get("callbackUrl") || "/dashboard";
  const returnTo = isSafePath(retRaw) ? retRaw : "/dashboard";

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
  const [unameStatus, setUnameStatus] =
    useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [unameMsg, setUnameMsg] = useState<string>("");
  const unameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unameAbort = useRef<AbortController | null>(null);

  // Initial profile load (no redirect on 401)
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
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
        /* ignore soft errors */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  // Debounced username check (no router, no effect-based nav)
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
      setUnameMsg(
        "3–24 chars; letters, numbers, . or _ (no .., no leading/trailing . or _).",
      );
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
    if (form.whatsapp !== pretty) {
      setForm((f) => ({ ...f, whatsapp: pretty }));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

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
      setSaved(true); // no auto-redirect
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-xl">
          <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
            <h1 className="text-2xl md:text-3xl font-extrabold">Finish your profile</h1>
            <p className="mt-1 text-white/85">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  const unameHintColor =
    unameStatus === "ok"
      ? "text-emerald-600"
      : unameStatus === "taken" || unameStatus === "invalid"
      ? "text-red-600"
      : "text-gray-500";

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
          <h1 className="text-2xl md:text-3xl font-extrabold">Finish your profile</h1>
          <p className="mt-1 text-white/90">
            Only <b>username</b> is required now. You can add the rest later in{" "}
            <Link href="/account/profile" className="underline">
              Profile
            </Link>
            .
          </p>
        </div>

        {unauthorized ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
          >
            Please{" "}
            <Link
              className="underline"
              href={`/signin?callbackUrl=${encodeURIComponent(
                `/onboarding?return=${encodeURIComponent(returnTo)}`,
              )}`}
            >
              sign in
            </Link>{" "}
            to finish onboarding.
          </div>
        ) : null}

        {saved ? (
          <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            Profile saved.{" "}
            <Link href={returnTo} className="underline">
              Continue
            </Link>
          </div>
        ) : null}

        <form
          onSubmit={onSubmit}
          className="mt-6 space-y-4 rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          noValidate
        >
          {/* Username */}
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-semibold">
              Username <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="username"
                className="w-full rounded-lg border px-3 py-2 pr-24 outline-none focus:ring-2 focus:ring-[#39a0ca]/40 dark:border-slate-700 dark:bg-slate-950"
                placeholder="e.g. brian254"
                value={form.username}
                onChange={(e) => onUsernameChange(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={24}
                required
              />
              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs">
                {unameStatus === "checking" ? "Checking…" : null}
              </div>
            </div>
            <p className={`mt-1 text-xs ${unameHintColor}`}>
              {unameStatus === "invalid"
                ? "3–24 letters/numbers, . or _ (no .., no leading/trailing . or _)."
                : unameStatus === "taken"
                ? unameMsg || "Username already taken."
                : unameStatus === "ok"
                ? unameMsg || "Available ✓"
                : "This will be visible on your listings and profile."}
            </p>
          </div>

          {/* WhatsApp */}
          <div>
            <label htmlFor="whatsapp" className="mb-1 block text-sm font-semibold">
              WhatsApp (optional)
            </label>
            <input
              id="whatsapp"
              className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-[#39a0ca]/40 dark:border-slate-700 dark:bg-slate-950"
              placeholder="07XXXXXXXX or +2547XXXXXXX"
              value={form.whatsapp}
              onChange={(e) =>
                setForm((f) => ({ ...f, whatsapp: e.target.value }))
              }
              onBlur={snapNormalizeWhatsapp}
              inputMode="tel"
            />
            {form.whatsapp ? (
              <p className="mt-1 text-xs">
                Normalized:{" "}
                {normalizedWa ? (
                  <span className="text-emerald-600">+{normalizedWa}</span>
                ) : (
                  <span className="text-red-600">Invalid</span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Buyers can reach you faster if you add WhatsApp.
              </p>
            )}
          </div>

          {/* City/Country */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="mb-1 block text-sm font-semibold">
                City (optional)
              </label>
              <input
                id="city"
                className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-[#39a0ca]/40 dark:border-slate-700 dark:bg-slate-950"
                placeholder="Nairobi"
                value={form.city}
                onChange={(e) =>
                  setForm((f) => ({ ...f, city: e.target.value }))
                }
              />
            </div>
            <div>
              <label htmlFor="country" className="mb-1 block text-sm font-semibold">
                Country (optional)
              </label>
              <input
                id="country"
                className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-[#39a0ca]/40 dark:border-slate-700 dark:bg-slate-950"
                placeholder="Kenya"
                value={form.country}
                onChange={(e) =>
                  setForm((f) => ({ ...f, country: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Postal/Address */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="postal" className="mb-1 block text-sm font-semibold">
                Postal code (optional)
              </label>
              <input
                id="postal"
                className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-[#39a0ca]/40 dark:border-slate-700 dark:bg-slate-950"
                placeholder="00100"
                value={form.postalCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, postalCode: e.target.value }))
                }
                inputMode="numeric"
              />
            </div>
            <div>
              <label htmlFor="address" className="mb-1 block text-sm font-semibold">
                Address (optional)
              </label>
              <input
                id="address"
                className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-[#39a0ca]/40 dark:border-slate-700 dark:bg-slate-950"
                placeholder="Street, building, etc."
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={
                saving ||
                unameStatus === "checking" ||
                unameStatus === "invalid" ||
                unameStatus === "taken"
              }
              className="rounded-xl bg-[#161748] px-4 py-2 font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <Link
              href={returnTo}
              className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Skip for now
            </Link>
          </div>

          <p className="text-[11px] text-gray-500 dark:text-slate-400">
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
