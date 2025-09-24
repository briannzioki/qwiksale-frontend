// src/app/sell/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

export default function SellLandingPage() {
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
            <Link
              href="/sell/product"
              className="btn-gradient-primary"
              aria-label="Post a product"
            >
              Post a product
            </Link>
            <Link
              href="/sell/service"
              className="btn-outline"
              aria-label="Post a service"
            >
              Post a service
            </Link>
          </div>

          {/* Tiny trust row */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-white/90">
            <div className="rounded-lg bg-white/10 px-3 py-2">Free to post</div>
            <div className="rounded-lg bg-white/10 px-3 py-2">No commission</div>
            <div className="rounded-lg bg-white/10 px-3 py-2">Direct WhatsApp/Calls</div>
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
                {/* emoji keeps it RSC-safe; swap for an icon if you like */}
                📦
              </span>
              <h2 className="text-xl font-semibold">Sell a Product</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
              Phones, electronics, fashion, furniture, vehicles — anything legit.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-slate-200">
              <li>• Add up to 6 photos</li>
              <li>• Set price or &ldquo;Contact for price&rdquo;</li>
              <li>• Optional WhatsApp number for quick chats</li>
            </ul>
          </div>
          <div className="mt-6">
            <Link href="/sell/product" className="btn-gradient-primary w-full" aria-label="Post a product">
              Start product listing
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
              <h2 className="text-xl font-semibold">Offer a Service</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
              Cleaning, repairs, beauty, events, transport, tech — list your service.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-slate-200">
              <li>• Fixed price or hourly/day rates</li>
              <li>• Service areas &amp; availability</li>
              <li>• Direct enquiries from buyers</li>
            </ul>
          </div>
          <div className="mt-6">
            <Link href="/sell/service" className="btn-outline w-full" aria-label="Post a service">
              Start service listing
            </Link>
          </div>
        </div>
      </section>

      {/* 3-STEP HOW IT WORKS */}
      <section className="mx-auto mt-10 max-w-5xl">
        <div className="card p-6 md:p-7">
          <h3 className="text-lg font-semibold">How it works</h3>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border dark:border-slate-700 p-4">
              <div className="text-2xl">1</div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Create a listing with photos and details.
              </p>
            </div>
            <div className="rounded-xl border dark:border-slate-700 p-4">
              <div className="text-2xl">2</div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Buyers contact you directly via call or WhatsApp.
              </p>
            </div>
            <div className="rounded-xl border dark:border-slate-700 p-4">
              <div className="text-2xl">3</div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Meet safely, close the deal, and get paid.
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-500 dark:text-slate-400">
            New to selling? See tips and safety guidelines in{" "}
            <Link href="/help" className="underline underline-offset-2">Help</Link>.
          </p>
        </div>
      </section>

      {/* FAQ (no JS, accessible) */}
      <section className="mx-auto mt-8 max-w-5xl">
        <div className="card p-6 md:p-7">
          <h3 className="text-lg font-semibold">Common questions</h3>
          <div className="mt-4 space-y-3">
            <details className="group rounded-lg border dark:border-slate-700 p-4">
              <summary className="cursor-pointer font-medium">Do I pay to post?</summary>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Posting is free. Optional promos may appear later to boost visibility.
              </p>
            </details>
            <details className="group rounded-lg border dark:border-slate-700 p-4">
              <summary className="cursor-pointer font-medium">How do buyers contact me?</summary>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Through the number you provide (calls/WhatsApp). Keep messages in-app if you prefer.
              </p>
            </details>
            <details className="group rounded-lg border dark:border-slate-700 p-4">
              <summary className="cursor-pointer font-medium">Any safety tips?</summary>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Meet in public places, verify payments (M-Pesa SMS vs app), and avoid sharing sensitive info.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* SECONDARY CTAS */}
      <section className="mx-auto mt-8 max-w-4xl text-center">
        <div className="card p-6 md:p-7">
          <p className="text-sm text-gray-700 dark:text-slate-200">
            Ready? Choose what you want to post:
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link href="/sell/product" className="btn-gradient-primary" aria-label="Post a product">
              Post a product
            </Link>
            <Link href="/sell/service" className="btn-outline" aria-label="Post a service">
              Post a service
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
