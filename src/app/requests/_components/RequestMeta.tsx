// src/app/requests/_components/RequestMeta.tsx
"use client";

import * as React from "react";

function fmt(iso?: string | null, withTime?: boolean) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-KE", {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" as const } : {}),
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export default function RequestMeta({
  location,
  category,
  createdAt,
  expiresAt,
  className = "",
}: {
  location?: string | null;
  category?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  className?: string;
}) {
  const created = fmt(createdAt, false);
  const expires = fmt(expiresAt, false);

  const parts: Array<React.ReactNode> = [];

  if (location) parts.push(<span key="loc">{location}</span>);
  if (category) parts.push(<span key="cat">{category}</span>);
  if (created) parts.push(<span key="created">Posted {created}</span>);
  if (expires) parts.push(<span key="expires">Expires {expires}</span>);

  if (parts.length === 0) return null;

  return (
    <div
      className={[
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]",
        className,
      ].join(" ")}
    >
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <span className="opacity-60" aria-hidden="true">
              •
            </span>
          ) : null}
          {p}
        </React.Fragment>
      ))}
    </div>
  );
}
