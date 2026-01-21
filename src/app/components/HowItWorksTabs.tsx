"use client";

import * as React from "react";
import Link from "next/link";

type TabKey = "buyers" | "sellers" | "carriers";

type Step = {
  title: string;
  body: string;
};

type TabSpec = {
  key: TabKey;
  label: string;
  kicker: string;
  intro: string;
  steps: Step[];
  ctas: Array<{
    href: string;
    label: string;
    tone?: "primary" | "outline";
    ariaLabel?: string;
    title?: string;
    testId?: string;
  }>;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeTabKey(raw: unknown): TabKey {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "sellers") return "sellers";
  if (s === "carriers") return "carriers";
  return "buyers";
}

const card = "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft";
const stepCard = "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm sm:p-4";

const btnPrimary =
  "btn-gradient-primary inline-flex min-h-9 items-center justify-center px-4 text-xs font-semibold sm:text-sm";

const btnOutline =
  "btn-outline inline-flex min-h-9 items-center justify-center px-4 text-xs font-semibold sm:text-sm";

const summaryBtn =
  "w-full cursor-pointer list-none rounded-2xl px-4 py-4 sm:px-5 sm:py-5 " +
  "focus-visible:outline-none focus-visible:ring-2 ring-focus";

const TABS: readonly TabSpec[] = [
  {
    key: "buyers",
    label: "Buyers",
    kicker: "For buyers",
    intro: "Browse listings, post requests, and coordinate safe delivery or meetups with clear trust signals.",
    steps: [
      { title: "Browse products & services", body: "Use search and filters to find what you need." },
      { title: "Message sellers/providers", body: "Ask questions, confirm details, and agree on next steps." },
      { title: "Post a request when needed", body: "If you can’t find it, request it and let providers reach out." },
      { title: "Choose delivery or meet safe", body: "Use carriers near you or a store area, or meet in public." },
      { title: "Review after", body: "Reviews help the community spot reliable sellers and providers." },
    ],
    ctas: [
      {
        href: "/search",
        label: "Browse marketplace",
        tone: "primary",
        ariaLabel: "Browse marketplace",
        title: "Browse listings",
      },
      {
        href: "/requests/new",
        label: "Post a request",
        tone: "outline",
        ariaLabel: "Post a request",
        title: "Post a request",
      },
      { href: "/delivery", label: "Find a carrier", tone: "outline", ariaLabel: "Find a carrier", title: "Delivery" },
    ],
  },
  {
    key: "sellers",
    label: "Sellers",
    kicker: "For sellers",
    intro: "Post products or services, respond to requests, and build trust through verified signals and reviews.",
    steps: [
      { title: "Create a strong profile", body: "Add username, contact info, and store location if applicable." },
      { title: "Post products or services", body: "Clear photos + honest descriptions convert faster." },
      { title: "Respond to requests", body: "Requests are demand signals. Reply quickly to win." },
      { title: "Coordinate delivery or pickup", body: "Use carriers or meet safely with clear instructions." },
      { title: "Build your trust", body: "Reviews and consistent behavior improve outcomes over time." },
    ],
    ctas: [
      { href: "/sell", label: "Post a listing", tone: "primary", ariaLabel: "Post a listing", title: "Post a listing" },
      {
        href: "/dashboard",
        label: "Open dashboard",
        tone: "outline",
        ariaLabel: "Open dashboard",
        title: "Dashboard",
      },
      { href: "/requests", label: "Browse requests", tone: "outline", ariaLabel: "Browse requests", title: "Requests" },
    ],
  },
  {
    key: "carriers",
    label: "Carriers",
    kicker: "For carriers",
    intro: "Onboard once (vehicle + station + evidence), then go online to accept delivery requests and complete trips.",
    steps: [
      { title: "Onboard as a carrier", body: "Carrier profile belongs to your user account (not separate auth)." },
      { title: "Set your station", body: "Your default area helps buyers find you faster." },
      { title: "Go online", body: "When you’re available, location sharing keeps your status fresh." },
      { title: "Accept and complete requests", body: "Deliveries move from pending to accepted to completed." },
      { title: "Follow enforcement rules", body: "Bans and suspensions prevent risky behavior and protect trust." },
    ],
    ctas: [
      {
        href: "/carrier/onboarding",
        label: "Become a carrier",
        tone: "primary",
        ariaLabel: "Become a carrier",
        title: "Carrier onboarding",
      },
      {
        href: "/carrier",
        label: "Carrier",
        tone: "outline",
        ariaLabel: "Carrier",
        title: "Carrier",
      },
      {
        href: "/carrier/requests",
        label: "View requests",
        tone: "outline",
        ariaLabel: "Carrier requests",
        title: "Carrier requests",
      },
    ],
  },
] as const;

export default function HowItWorksTabs({
  initialTab,
  className,
}: {
  initialTab?: TabKey | string;
  className?: string;
}) {
  const initProvided = typeof initialTab === "string" && initialTab.trim().length > 0;
  const init = safeTabKey(initialTab);

  return (
    <section className={cn("space-y-3 sm:space-y-4", className)} aria-label="How it works journeys">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">How it works</p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
            Choose a journey
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Buyers, sellers, and carriers each have a clear path. Open a section to see steps and actions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/how-it-works" prefetch={false} className={btnOutline} aria-label="Open full how it works page">
            Full How it works page
          </Link>
          <Link href="/trust" prefetch={false} className={btnOutline} aria-label="Open trust page">
            Trust and safety
          </Link>
        </div>
      </div>

      <div className={cn(card, "divide-y divide-[var(--border-subtle)]")} aria-label="Journeys list">
        {TABS.map((spec) => {
          const stepCols = clampInt(spec.steps.length, 4, 6);
          const defaultOpen = initProvided ? spec.key === init : false;

          return (
            <details
              key={spec.key}
              className="group"
              {...(defaultOpen ? { open: true } : {})}
            >
              <summary className={summaryBtn} aria-label={`${spec.label} journey`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {spec.kicker}
                    </div>
                    <div className="mt-1 text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
                      {spec.label}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{spec.intro}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text)] group-open:hidden">Open</span>
                    <span className="text-xs font-semibold text-[var(--text)] hidden group-open:inline">Close</span>
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-xl border",
                        "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] shadow-sm",
                      )}
                      aria-hidden="true"
                      title="Toggle"
                    >
                      +
                    </span>
                  </div>
                </div>
              </summary>

              <div className="px-4 pb-4 sm:px-5 sm:pb-5" role="region" aria-label={`${spec.label} journey details`}>
                <div className="flex flex-wrap items-center gap-2">
                  {spec.ctas.map((c) => {
                    const cls = c.tone === "primary" ? btnPrimary : btnOutline;
                    return (
                      <Link
                        key={`${spec.key}-${c.href}`}
                        href={c.href}
                        prefetch={false}
                        className={cls}
                        aria-label={c.ariaLabel}
                        title={c.title}
                        data-testid={c.testId}
                      >
                        {c.label}
                      </Link>
                    );
                  })}
                </div>

                <div
                  className={cn(
                    "mt-4 grid grid-cols-1 gap-3 sm:gap-4",
                    stepCols >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
                  )}
                >
                  {spec.steps.map((s, idx) => (
                    <div key={`${spec.key}-${idx}`} className={stepCard}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Step {String(idx + 1).padStart(2, "0")}
                      </div>
                      <div className="mt-1 text-sm font-extrabold tracking-tight text-[var(--text)]">{s.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{s.body}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link href="/how-it-works" prefetch={false} className={btnOutline} aria-label="Open full how it works page">
                    Full How it works page
                  </Link>
                  <Link href="/trust" prefetch={false} className={btnOutline} aria-label="Open trust page">
                    Trust and safety
                  </Link>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
