// src/app/sell/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { auth } from "@/auth";

export default async function SellLandingPage() {
  const session = await auth().catch(() => null);
  const isAuthed = Boolean(session?.user);

  const productHref = isAuthed
    ? "/sell/product"
    : `/signin?callbackUrl=${encodeURIComponent(
        "/sell/product"
      )}`;
  const serviceHref = isAuthed
    ? "/sell/service"
    : `/signin?callbackUrl=${encodeURIComponent(
        "/sell/service"
      )}`;

  return (
    <div className="container-page py-10">
      {/* HERO */}
      <section className="mx-auto max-w-4xl text-center">
        <div className="rounded-2xl p-8 md:p-10 text-white bg-gradient-to-br from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Post a listing in minutes
          </h1>
          <p className="mt-3 text-white/90 text-pretty">
            Reach buyers directly. Add photos, price, and your contact — simple.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {isAuthed ? (
              <>
                <Link
                  prefetch={false}
                  href={productHref}
                  className="btn-gradient-primary"
                  aria-label="Post a product"
                >
                  Post a product
                </Link>
                <Link
                  prefetch={false}
                  href={serviceHref}
                  className="btn-outline"
                  aria-label="Post a service"
                >
                  Post a service
                </Link>
              </>
            ) : (
              <>
                <Link
                  prefetch={false}
                  href={`/signin?callbackUrl=${encodeURIComponent(
                    "/sell"
                  )}`}
                  className="btn-gradient-primary"
                  aria-label="Sign in"
                >
                  Sign in
                </Link>
                <Link
                  prefetch={false}
                  href="/signup"
                  className="btn-outline"
                  aria-label="Create an account"
                >
                  Create an account
                </Link>
              </>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-white/90">
            <div className="rounded-lg bg-white/10 px-3 py-2">
              Free to post
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2">
              No commission
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2">
              Direct WhatsApp/Calls
            </div>
          </div>
        </div>
      </section>

      {/* CHOOSER CARDS */}
      <section className="mx-auto mt-8 max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Product card */}
        <div className="card p-6 md:p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brandBlue/10 text-brandBlue">
                📦
              </span>
              <h2 className="text-xl font-semibold">
                Sell a Product
              </h2>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
              Phones, electronics, fashion, furniture, vehicles — anything legit.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-slate-200">
              <li>• Add up to 6 photos</li>
              <li>
                • Set price or &ldquo;Contact for price&rdquo;
              </li>
              <li>
                • Optional WhatsApp number for quick chats
              </li>
            </ul>
          </div>
          <div className="mt-6">
            <Link
              prefetch={false}
              href={productHref}
              className="btn-gradient-primary w-full"
              aria-label={
                isAuthed
                  ? "Post a product"
                  : "Sign in to start product listing"
              }
            >
              {isAuthed
                ? "Start product listing"
                : "Sign in"}
            </Link>
          </div>
        </div>

        {/* Service card */}
        <div className="card p-6 md:p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brandGreen/10 text-brandGreen">
                🧰
              </span>
              <h2 className="text-xl font-semibold">
                Offer a Service
              </h2>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
              Cleaning, repairs, beauty, events, transport, tech — list your service.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-slate-200">
              <li>
                • Fixed price or hourly/day rates
              </li>
              <li>
                • Service areas &amp; availability
              </li>
              <li>
                • Direct enquiries from buyers
              </li>
            </ul>
          </div>
          <div className="mt-6">
            <Link
              prefetch={false}
              href={serviceHref}
              className={
                isAuthed
                  ? "btn-outline w-full"
                  : "btn-gradient-primary w-full"
              }
              aria-label={
                isAuthed
                  ? "Post a service"
                  : "Login to start service listing"
              }
            >
              {isAuthed
                ? "Start service listing"
                : "Login"}
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto mt-10 max-w-5xl">
        <div className="card p-6 md:p-7">
          <h3 className="text-lg font-semibold">
            How it works
          </h3>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border dark:border-slate-700 p-4">
              <div className="text-2xl font-semibold">
                1
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Create a clear listing with photos and details.
              </p>
            </div>
            <div className="rounded-xl border dark:border-slate-700 p-4">
              <div className="text-2xl font-semibold">
                2
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Interested buyers contact you directly via call, SMS, or WhatsApp.
              </p>
            </div>
            <div className="rounded-xl border dark:border-slate-700 p-4">
              <div className="text-2xl font-semibold">
                3
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Meet, verify, and close the deal. No commission fees.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
