// src/app/components/HeaderClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import Navbar from "@/app/components/Navbar";
import { Button } from "@/app/components/Button";
import { Icon } from "@/app/components/Icon";
import IconButton from "@/app/components/IconButton";
import HeaderInlineSearch from "@/app/components/HeaderInlineSearch";

type Props = {
  initialAuth: { isAuthed: boolean; isAdmin: boolean };
};

export default function HeaderClient({ initialAuth }: Props) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const inAdmin = pathname.startsWith("/admin");

  const isAuthed = initialAuth.isAuthed;
  const isAdmin = initialAuth.isAdmin;

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

  const currentUrl = React.useMemo(() => {
    try {
      const { search, hash } = window.location;
      return `${pathname}${search || ""}${hash || ""}`;
    } catch {
      return pathname || "/";
    }
  }, [pathname]);

  const signInHref = `/signin?callbackUrl=${encodeURIComponent(currentUrl)}`;
  const dashboardHref = isAuthed
    ? isAdmin
      ? "/admin"
      : "/dashboard"
    : "/signin";

  const rightSlot = (
    <div className="flex items-center gap-2">
      {isAuthed ? (
        <>
          {!inAdmin && (
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
          )}
          {!inAdmin && (
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
          )}
          <Link
            href={dashboardHref}
            prefetch={false}
            className="ml-1 inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10 transition"
          >
            {isAdmin ? "Admin" : "Dashboard"}
          </Link>
        </>
      ) : (
        <>
          <Link
            href={signInHref}
            prefetch={false}
            className="hidden md:inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-slate-200 dark:hover:text-white border border-transparent hover:border-gray-200 dark:hover:border-white/10 transition"
          >
            Sign in
          </Link>
          <Button
            asChild
            size="sm"
            variant="primary"
            className="hidden md:inline-flex"
          >
            <Link href="/signup" prefetch={false}>
              Join
            </Link>
          </Button>
          <IconButton
            icon="login"
            variant="ghost"
            srLabel="Open account"
            className="md:hidden"
            onClick={() => router.push(signInHref)}
          />
        </>
      )}
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
