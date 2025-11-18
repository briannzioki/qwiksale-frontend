// src/app/components/SiteHeader.tsx
import Link from "next/link";
import { auth } from "@/auth";
import AuthButtons from "@/app/components/AuthButtons";

export default async function SiteHeader() {
  // Server-side session fetch → no client loading state
  const session = await auth();
  const isAuthed = !!session?.user?.id;

  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        {/* Left: brand + primary nav */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-base font-extrabold tracking-tight text-[#161748] dark:text-white"
            prefetch={false}
            aria-label="QwikSale Home"
          >
            QwikSale
          </Link>

          <nav className="hidden md:flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <Link
              href="/sell"
              className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              prefetch={false}
            >
              Sell
            </Link>
            <Link
              href="/search"
              className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              prefetch={false}
            >
              Search
            </Link>
          </nav>
        </div>

        {/* Right: account / auth */}
        <div className="flex items-center gap-2">
          {isAuthed ? (
            // Unified account dropdown (chip renders inside its trigger)
            <AuthButtons />
          ) : (
            <>
              <Link
                href="/signin"
                prefetch={false}
                className="hidden md:inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium
                           text-gray-700 hover:text-gray-900 dark:text-slate-200 dark:hover:text-white
                           border border-transparent hover:border-gray-200 dark:hover:border-white/10 transition"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                prefetch={false}
                className="hidden md:inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold
                           bg-[#161748] text-white hover:opacity-95 dark:bg-[#39a0ca] transition"
              >
                Join
              </Link>

              {/* Mobile quick sign-in */}
              <Link
                href="/signin"
                prefetch={false}
                aria-label="Sign in"
                className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
              >
                {/* simple login glyph */}
                <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="currentColor">
                  <path d="M10.5 7V4a1 1 0 0 1 1-1H20a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-8.5a1 1 0 1 1 0-2H19V5h-7.5a1 1 0 0 1-1-1Zm-1.2 5.6 2.7 2.7a1 1 0 1 1-1.4 1.4l-4.41-4.4a1 1 0 0 1 0-1.4l4.4-4.4a1 1 0 1 1 1.42 1.4l-2.71 2.7H19a1 1 0 1 1 0 2h-9.7Z" />
                </svg>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
