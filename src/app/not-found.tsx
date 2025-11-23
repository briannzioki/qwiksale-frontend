// src/app/not-found.tsx
export const dynamic = "force-static";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pb-10">
      <header
        className="bg-spotlight bg-noise text-white"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black 80%, transparent)",
        }}
      >
        <div className="container-page pt-12 pb-8 md:pt-14 md:pb-10">
          <p className="text-sm/5 opacity-90">404 — Not found</p>
          <h1 className="mt-1 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            We can’t find that page
          </h1>
          <p className="mt-2 max-w-prose text-sm text-white/90">
            The link may be broken or the page may have been removed.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" prefetch={false} className="chip chip--light">
              Home
            </Link>
            <Link
              href="/search"
              prefetch={false}
              className="chip chip--light"
            >
              Browse listings
            </Link>
            <Link href="/sell" prefetch={false} className="chip chip--light">
              Post a listing
            </Link>
          </div>
        </div>
      </header>

      <div className="container-page mt-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight">
            Try one of these
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" prefetch={false} className="btn-outline">
              Go home
            </Link>
            <Link
              href="/search"
              prefetch={false}
              className="btn-gradient-primary"
            >
              Search QwikSale
            </Link>
            <Link
              href="/help"
              prefetch={false}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            >
              Help Center
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
