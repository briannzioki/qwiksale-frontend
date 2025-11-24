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
    : `/signin?callbackUrl=${encodeURIComponent("/sell/product")}`;

  const serviceHref = isAuthed
    ? "/sell/service"
    : `/signin?callbackUrl=${encodeURIComponent("/sell/service")}`;

  return (
    <div className="container-page py-10">
      {/* HERO */}
      <section className="mx-auto max-w-4xl text-center">
        <div className="rounded-2xl bg-gradient-to-br from-brandNavy via-brandGreen to-brandBlue p-8 text-white shadow-soft md:p-10">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Post a listing in minutes
          </h1>
          <p className="mt-3 text-pretty text-white/90">
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
                  className="btn-gradient-primary"
                  aria-label="Post a service"
                >
                  Post a service
                </Link>
              </>
            ) : (
              <>
                <Link
                  prefetch={false}
                  href={`/signin?callbackUrl=${encodeURIComponent("/sell")}`}
                  className="btn-gradient-primary"
                  aria-label="Sign in to post"
                >
                  Sign in to post
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

          <div className="mt-5 grid grid-cols-1 gap-2 text-xs text-white/90 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-slate-950/20 px-3 py-2 shadow-sm shadow-black/20 backdrop-blur-sm">
              Free to post
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/20 px-3 py-2 shadow-sm shadow-black/20 backdrop-blur-sm">
              No commission
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/20 px-3 py-2 shadow-sm shadow-black/20 backdrop-blur-sm">
              Direct WhatsApp / calls
            </div>
          </div>
        </div>
      </section>

      {/* CHOOSER CARDS */}
      <section className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
        {/* Product card */}
        <div className="card flex flex-col justify-between p-6 md:p-7">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brandBlue/10 text-brandBlue">
                📦
              </span>
              <h2 className="text-xl font-semibold">Sell a Product</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Phones, electronics, fashion, furniture, vehicles — anything legit.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• Add up to 6 photos</li>
              <li>• Set price or &ldquo;Contact for price&rdquo;</li>
              <li>• Optional WhatsApp number for quick chats</li>
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
                  : "Sign in to start a product listing"
              }
            >
              {isAuthed ? "Start product listing" : "Sign in to post a product"}
            </Link>
          </div>
        </div>

        {/* Service card */}
        <div className="card flex flex-col justify-between p-6 md:p-7">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brandGreen/10 text-brandGreen">
                🧰
              </span>
              <h2 className="text-xl font-semibold">Offer a Service</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Cleaning, repairs, beauty, events, transport, tech — list your
              service.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• Fixed price or hourly/day rates</li>
              <li>• Service areas &amp; availability</li>
              <li>• Direct enquiries from buyers</li>
            </ul>
          </div>
          <div className="mt-6">
            <Link
              prefetch={false}
              href={serviceHref}
              className="btn-gradient-primary w-full"
              aria-label={
                isAuthed
                  ? "Post a service"
                  : "Sign in to start a service listing"
              }
            >
              {isAuthed ? "Start service listing" : "Sign in to post a service"}
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto mt-10 max-w-5xl">
        <div className="card p-6 md:p-7">
          <h3 className="text-lg font-semibold">How it works</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-4">
              <div className="text-2xl font-semibold">1</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Create a clear listing with photos and details.
              </p>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-2xl font-semibold">2</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Interested buyers contact you directly via call, SMS, or
                WhatsApp.
              </p>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-2xl font-semibold">3</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Meet, verify, and close the deal. No commission fees.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto mt-10 max-w-xl">
        <div className="card p-6 text-center md:p-7">
          <h3 className="text-base font-semibold">
            Ready? Choose what you want to post.
          </h3>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              prefetch={false}
              href={productHref}
              className="btn-gradient-primary"
              aria-label={
                isAuthed ? "Post a product" : "Sign in to post a product"
              }
            >
              Post a product
            </Link>
            <Link
              prefetch={false}
              href={serviceHref}
              className="btn-gradient-primary"
              aria-label={
                isAuthed ? "Post a service" : "Sign in to post a service"
              }
            >
              Post a service
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
