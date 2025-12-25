// src/app/dashboard/_components/ProfileCompletionCard.tsx
import Link from "next/link";

export type ProfileMissingField = "username" | "emailVerified";

export type ProfileCompletion = {
  percent: number;
  missingFields: ProfileMissingField[];
};

const FIELD_LABEL: Record<
  ProfileMissingField,
  { title: string; hint: string }
> = {
  username: {
    title: "Add a username",
    hint: "A username helps buyers recognise you and appears on your listings.",
  },
  emailVerified: {
    title: "Verify your email",
    hint: "Verified email helps account trust and reduces friction.",
  },
};

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export default function ProfileCompletionCard({
  completion,
  href,
}: {
  completion: ProfileCompletion;
  href: string;
}) {
  const percent = clampPercent(completion?.percent ?? 0);
  const missing = Array.isArray(completion?.missingFields)
    ? completion.missingFields
    : [];

  const isComplete = missing.length === 0;

  return (
    <section
      aria-label="Profile completion"
      role="region"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft backdrop-blur-sm sm:p-4 md:p-6"
      data-testid="dashboard-profile-completion-card"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {isComplete ? "Profile complete" : "Profile completion"}
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)] sm:text-sm">
            {isComplete
              ? "You’re all set - your account is ready."
              : "Finish these steps to complete your profile."}
          </p>

          {!isComplete && (
            <ul className="mt-3 space-y-2">
              {missing.map((k) => {
                const meta = FIELD_LABEL[k];
                return (
                  <li
                    key={k}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3"
                  >
                    <div className="text-sm font-medium text-[var(--text)]">
                      {meta.title}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs">
                      {meta.hint}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Progress</span>
            <span className="font-medium text-[var(--text)]">{percent}%</span>
          </div>

          <div
            className="mt-2 h-2 w-full rounded-full bg-[var(--bg-subtle)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Profile completion progress"
          >
            <div
              className="h-2 rounded-full bg-[var(--text)] transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
            <Link
              href={href}
              prefetch={false}
              className={
                isComplete
                  ? "btn-outline text-xs md:text-sm"
                  : "btn-gradient-primary text-xs md:text-sm"
              }
              data-testid="dashboard-profile-completion-link"
            >
              {isComplete ? "View profile" : "Complete profile"}
            </Link>

            {!isComplete && (
              <Link
                href="/account/profile"
                prefetch={false}
                className="btn-outline text-xs md:text-sm"
              >
                Edit Account
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
