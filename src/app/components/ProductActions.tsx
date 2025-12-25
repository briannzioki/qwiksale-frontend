// src/app/components/ProductActions.tsx
// SERVER COMPONENT - guarantees the "Visit Store" link is SSR-visible and provides a guest fallback.

import type React from "react";
import Link from "next/link";
import ProductActionsClient from "@/app/components/ProductActionsClient";

type BaseProps = {
  /** Absolute or app-relative href to the store page, e.g. `/store/johndoe` */
  storeHref: string;
  /** Listing id */
  id: string;
  /** If true, stops event bubbling so parent tiles don’t hijack clicks */
  withinCard?: boolean;
  /** Server-checked boolean for auth-aware dialog (optional) */
  isAuthed?: boolean;
  /** Optional wrapper classes */
  className?: string;
};

type ProductActionsProps = BaseProps & { kind: "product" };
type ServiceActionsProps = BaseProps & { kind: "service" };
export type Props = ProductActionsProps | ServiceActionsProps;

export default function ProductActions({
  kind,
  storeHref,
  id,
  withinCard = false,
  isAuthed,
  className = "",
}: Props) {
  const stopHandlers = withinCard
    ? {
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
      }
    : undefined;

  const guestLabel = kind === "service" ? "Message provider" : "Message seller";

  const actionButtonCls = [
    "rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition",
    "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
    "hover:bg-[var(--bg-subtle)] hover:border-[var(--border)]",
    "active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus",
  ].join(" ");

  return (
    <div
      className={[
        "relative z-[5] mt-3 flex flex-wrap items-center gap-3",
        "text-[var(--text)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-actions={kind}
      {...(stopHandlers as any)}
    >
      {/* Client-only rich messaging controls */}
      <ProductActionsClient kind={kind} id={id} isAuthed={isAuthed} />

      {/* SSR-visible Visit Store anchor used in tests */}
      <Link
        href={storeHref}
        prefetch={false}
        aria-label="Visit Store"
        data-testid="visit-store-link"
        className={actionButtonCls}
      >
        Visit Store
      </Link>

      {/* Guest-only SSR fallback (deterministic label, no JS needed) */}
      {isAuthed === false && (
        <button
          type="button"
          className={actionButtonCls}
          aria-label={guestLabel}
          onClick={() => {
            // eslint-disable-next-line no-alert
            alert("Please sign in to send a message.");
          }}
          data-testid="guest-message-fallback"
        >
          {guestLabel}
        </button>
      )}
    </div>
  );
}
