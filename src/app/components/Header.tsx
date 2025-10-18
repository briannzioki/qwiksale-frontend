"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import Navbar from "@/app/components/Navbar";
import SearchBox from "@/app/components/SearchBox";
import HeaderInlineSearch from "@/app/components/HeaderInlineSearch";
import { Button } from "@/app/components/Button";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import IconButton from "@/app/components/IconButton";
import { useRouter, usePathname } from "next/navigation";
import AuthButtons from "@/app/components/AuthButtons";
import RoleChip from "@/app/components/RoleChip";

export default function Header() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const inAdmin = pathname?.startsWith("/admin");

  // role/subscription for chips + routing
  const role = (session?.user as any)?.role as string | undefined;
  const subscription = (session?.user as any)?.subscription as string | undefined;
  const isAdmin =
    ((role || "").toUpperCase() === "ADMIN") ||
    ((role || "").toUpperCase() === "SUPERADMIN") ||
    ((session?.user as any)?.isAdmin === true);

  // Prefer explicit username; fall back to email
  const displayName = React.useMemo(() => {
    const u = session?.user as any;
    const username: string | undefined =
      u?.username ?? u?.userName ?? u?.handle ?? u?.preferred_username;
    const email: string | undefined = u?.email;
    return username && String(username).trim().length > 0 ? String(username) : (email ?? "");
  }, [session]);

  // Optional counts (only show badges when > 0)
  const savedCount = React.useMemo(() => {
    const n = (session as any)?.user?.savedCount;
    return typeof n === "number" && n > 0 ? n : undefined;
  }, [session]);

  const unreadCount = React.useMemo(() => {
    const n = (session as any)?.user?.unreadMessages ?? (session as any)?.unreadCount;
    return typeof n === "number" && n > 0 ? n : undefined;
  }, [session]);

  // Center slot: compact search (always show, including on Home)
  const searchSlot = (
    <div className="w-full">
      {/* Desktop inline command-like search */}
      <div className="hidden md:block">
        <HeaderInlineSearch />
      </div>
      {/* Mobile fallback */}
      <div className="md:hidden">
        <SearchBox className="w-full" placeholder="Search phones, cars, services…" destination="search" />
      </div>
    </div>
  );

  // Right actions: auth-aware, icon-only where appropriate
  const rightSlot = (
    <div className="flex items-center gap-2">
      {status === "loading" ? (
        <div className="h-8 w-24 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
      ) : status === "authenticated" ? (
        <>
          {/* Role/Plan chip: ADMIN replaces plan (wrap to control visibility without touching RoleChip props) */}
          <span className="hidden sm:inline-flex">
            <RoleChip role={role ?? null} subscription={subscription ?? null} />
          </span>

          {/* Favorites (hide inside /admin) */}
          {!inAdmin && (
            <Link
              href="/saved"
              prefetch={false}
              aria-label="Favorites"
              title="Favorites"
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg:white/10 transition"
            >
              <Icon name="heart" />
              {typeof savedCount === "number" ? (
                <span
                  className="absolute -top-1 -right-1 min-w-[1rem] h-4 rounded-full bg-[#f95d9b] px-1 text-[10px] leading-4 text-white text-center"
                  aria-label={`${savedCount} favorites`}
                >
                  {savedCount}
                </span>
              ) : null}
              <span className="sr-only">Favorites</span>
            </Link>
          )}

          {/* Messages (hide inside /admin) */}
          {!inAdmin && (
            <Link
              href="/messages"
              prefetch={false}
              aria-label="Messages"
              title="Messages"
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
            >
              <Icon name="message" />
              {typeof unreadCount === "number" ? (
                <span
                  className="absolute -top-1 -right-1 min-w-[1rem] h-4 rounded-full bg-[#39a0ca] px-1 text-[10px] leading-4 text-white text-center"
                  aria-label={`${unreadCount} unread messages`}
                >
                  {unreadCount}
                </span>
              ) : null}
              <span className="sr-only">Messages</span>
            </Link>
          )}

          {/* Profile */}
          <Link
            href="/profile"
            prefetch={false}
            aria-label={displayName ? `Profile: ${displayName}` : "Profile"}
            title={displayName || "Profile"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <Icon name="user" />
            <span className="sr-only">{displayName ? `Profile: ${displayName}` : "Profile"}</span>
          </Link>

          {/* Admin/Dashboard smart affordance */}
          <Link
            href={isAdmin ? "/admin" : "/dashboard"}
            prefetch={false}
            aria-label={isAdmin ? "Open admin" : "Open dashboard"}
            className="hidden md:inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium
                       text-gray-700 hover:text-gray-900 dark:text-slate-200 dark:hover:text-white
                       border border-transparent hover:border-gray-200 dark:hover:border-white/10 transition"
          >
            {/* ✅ use an allowed icon name */}
            <Icon name={isAdmin ? "secure" : "settings"} />
            {isAdmin ? "Admin" : "Dashboard"}
          </Link>

          {/* Avatar/menu, sign out, etc. */}
          <div className="hidden md:block">
            <AuthButtons />
          </div>
        </>
      ) : (
        <>
          <Link
            href="/signin"
            prefetch={false}
            className="hidden md:inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium
                       text-gray-700 hover:text-gray-900 dark:text-slate-200 dark:hover:text-white
                       border border-transparent hover:border-gray-200 dark:hover:border-white/10 transition"
          >
            <Icon name="login" />
            Sign in
          </Link>
          <Button asChild size="sm" variant="primary" className="hidden md:inline-flex">
            <Link href="/signup" prefetch={false}>
              <Icon name="user" />
              Join
            </Link>
          </Button>

          {/* Mobile: quick icon to push to signin */}
          <IconButton
            icon="login"
            variant="ghost"
            srLabel="Sign in"
            className="md:hidden"
            onClick={() => router.push("/signin")}
          />
        </>
      )}
    </div>
  );

  return (
    <>
      {/* ♿ Skip link: first focusable element in the header */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 bg-white dark:bg-slate-900 px-3 py-2 rounded shadow"
      >
        Skip to content
      </a>

      <Navbar
        searchSlot={searchSlot}
        rightSlot={rightSlot}
        hideSellCta={false}
        /* We render our own Favorites/Messages with links now */
        showSaved={false}
        showMessages={false}
        sticky={true}
      />
    </>
  );
}
