// src/app/components/HeaderClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import Navbar from "@/app/components/Navbar";
import { Icon } from "@/app/components/Icon";
import HeaderInlineSearch from "@/app/components/HeaderInlineSearch";
import AuthButtons from "@/app/components/AuthButtons";

type Props = {
  initialAuth: { isAuthed: boolean; isAdmin: boolean };
};

export default function HeaderClient({ initialAuth }: Props) {
  const pathname = usePathname() || "/";
  const inAdmin = pathname.startsWith("/admin");

  const isAuthedHint = initialAuth.isAuthed;

  function getInlineSearch() {
    const root = document.getElementById("header-inline-search");
    if (!root) return null;
    const input = root.querySelector<HTMLInputElement>('input[name="q"]');
    const toggle = root.querySelector<HTMLButtonElement>(
      '[data-testid="header-inline-search-toggle"]',
    );
    const isOpen = root.dataset["open"] === "true";
    return { root, input, toggle, isOpen };
  }

  // Slash / Cmd+K → open/focus inline search (user-initiated only).
  // If another handler (e.g. SearchHotkey overlay) already consumed the event,
  // we bail when e.defaultPrevented is true to avoid double-toggling.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSlash = e.key === "/";
      const isCmdK = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      if (!isSlash && !isCmdK) return;
      if (e.defaultPrevented) return;

      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase() ?? "";
      const typing =
        tag === "input" || tag === "textarea" || t?.isContentEditable;
      if (typing) return;

      const found = getInlineSearch();
      if (!found) return;
      const { input, toggle, isOpen } = found;

      e.preventDefault();

      if (!isOpen && toggle) {
        toggle.click();
      }

      if (input) {
        input.focus();
        input.select?.();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rightSlot = (
    <div className="flex items-center gap-2">
      {/* Saved & Messages icons only when we have a server-side auth hint
         and we're not on admin shell. The actual account button is always
         handled by AuthButtons. */}
      {isAuthedHint && !inAdmin && (
        <>
          <Link
            href="/saved"
            prefetch={false}
            aria-label="Favorites"
            title="Favorites"
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <Icon name="heart" />
            <span className="sr-only">Favorites</span>
          </Link>
          <Link
            href="/messages"
            prefetch={false}
            aria-label="Messages"
            title="Messages"
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <Icon name="message" />
            <span className="sr-only">Messages</span>
          </Link>
        </>
      )}

      {/* This is the shared account menu / sign-in surface.
         - When unauthenticated → shows “Sign in” link.
         - When authenticated → shows account button with avatar + single session chip.
         Tests 11/12/30/31/23 all target this trigger. */}
      <AuthButtons initialIsAuthedHint={isAuthedHint} />
    </div>
  );

  return (
    <Navbar
      searchSlot={<HeaderInlineSearch />}
      rightSlot={rightSlot}
      hideSellCta={false}
      showSaved={false}
      showMessages={false}
      sticky
    />
  );
}
