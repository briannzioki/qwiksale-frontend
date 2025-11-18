// src/app/components/Header.tsx
"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

import Navbar from "@/app/components/Navbar";
import SearchBox from "@/app/components/SearchBox";
import HeaderInlineSearch from "@/app/components/HeaderInlineSearch";
import { Button } from "@/app/components/Button";
import { Icon } from "@/app/components/Icon";
import IconButton from "@/app/components/IconButton";
import AuthButtons from "@/app/components/AuthButtons";

export default function Header() {
  const { status } = useSession(); // loading | authenticated | unauthenticated
  const router = useRouter();
  const pathname = usePathname();
  const inAdmin = pathname?.startsWith("/admin");

  // Center: compact search
  const searchSlot = (
    <div className="w-full">
      <div className="hidden md:block">
        <HeaderInlineSearch />
      </div>
      <div className="md:hidden">
        <SearchBox
          className="w-full"
          placeholder="Search phones, cars, services…"
          destination="search"
        />
      </div>
    </div>
  );

  // Right actions
  const rightSlot = (
    <div className="flex items-center gap-2">
      {status === "loading" ? (
        // 🔒 Important: never show "Sign in" during loading
        <div className="h-8 w-24 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
      ) : status === "authenticated" ? (
        <>
          {/* Favorites (hide in /admin) */}
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

          {/* Messages (hide in /admin) */}
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

          {/* Account dropdown (contains the only chip inside its trigger) */}
          <div className="hidden md:block">
            <AuthButtons />
          </div>

          {/* Mobile account trigger */}
          <div className="md:hidden">
            <AuthButtons />
          </div>
        </>
      ) : (
        // unauthenticated
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

          {/* Mobile quick sign-in */}
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
      {/* Skip to content */}
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
        showSaved={false}
        showMessages={false}
        sticky
      />
    </>
  );
}
