import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";

export const metadata: Metadata = {
  title: "Help Center — QwikSale",
  description:
    "Get help using QwikSale: account issues, posting and managing listings, safety, and payments. Contact support or report a problem.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/help" },
};

function Card({
  title,
  children,
  href,
}: {
  title: string;
  children: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="card group block rounded-xl border p-5 shadow-sm transition hover:shadow-md dark:border-slate-800">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{children}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function HelpCenterPage() {
  return (
    <main className="container-page py-8">
      <SectionHeader
        title="Help Center"
        subtitle="Find answers fast, or reach the team for personal support."
        className="bg-spotlight brand-noise"
        actions={
          <div className="flex gap-2">
            <Link href="/contact" className="btn-gradient-primary text-sm">Contact Support</Link>
            <Link href="/report" className="btn-outline text-sm">Report a Problem</Link>
          </div>
        }
      />

      {/* Quick links */}
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <Card title="Contact Support" href="/contact">
          Message us about account, billing, or product questions.
        </Card>
        <Card title="Report a Problem" href="/report">
          Flag suspicious activity, scams, or listing issues.
        </Card>
        <Card title="Safety Guidelines" href="/safety">
          Meet-up tips, payments, and staying safe on QwikSale.
        </Card>
      </section>

      {/* FAQs (no JS; native details/summary) */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Frequently Asked Questions</h2>
        <div className="mt-4 divide-y rounded-xl border bg-white shadow-sm brand-noise dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium">How do I create an account?</span>
              <span className="text-sm text-gray-500 group-open:hidden">Show</span>
              <span className="hidden text-sm text-gray-500 group-open:inline">Hide</span>
            </summary>
            <div className="mt-2 text-sm text-gray-700 dark:text-slate-300">
              Go to <Link className="underline" href="/signup">Create account</Link>, enter your
              email & password, or continue with Google. After signing up, complete your{" "}
              <Link className="underline" href="/account/profile">profile</Link> for better trust.
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium">How do I post a listing?</span>
              <span className="text-sm text-gray-500 group-open:hidden">Show</span>
              <span className="hidden text-sm text-gray-500 group-open:inline">Hide</span>
            </summary>
            <div className="mt-2 text-sm text-gray-700 dark:text-slate-300">
              Visit <Link className="underline" href="/sell">Post a listing</Link>, choose a
              category, add photos, price (or leave 0 for “Contact for price”), and publish.
              Verified listings may get boosted placement.
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium">How do I save or share items?</span>
              <span className="text-sm text-gray-500 group-open:hidden">Show</span>
              <span className="hidden text-sm text-gray-500 group-open:inline">Hide</span>
            </summary>
            <div className="mt-2 text-sm text-gray-700 dark:text-slate-300">
              Tap the heart on a product page to save it. Access everything under{" "}
              <Link className="underline" href="/saved">Saved</Link>. Use the “Copy” button on a
              product card to share a direct link.
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium">How do payments work?</span>
              <span className="text-sm text-gray-500 group-open:hidden">Show</span>
              <span className="hidden text-sm text-gray-500 group-open:inline">Hide</span>
            </summary>
            <div className="mt-2 text-sm text-gray-700 dark:text-slate-300">
              QwikSale is a neutral marketplace. Coordinate with the seller directly. Prefer
              in-person meetups in public places and confirm item condition before paying. For
              tips, see <Link className="underline" href="/safety">Safety</Link>.
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium">I can’t sign in / Google loop</span>
              <span className="text-sm text-gray-500 group-open:hidden">Show</span>
              <span className="hidden text-sm text-gray-500 group-open:inline">Hide</span>
            </summary>
            <div className="mt-2 text-sm text-gray-700 dark:text-slate-300">
              Clear cookies for <span className="font-mono">qwiksale.sale</span>, ensure third-party
              cookies are allowed, and try again. If you signed up with Google before, use{" "}
              <strong>Continue with Google</strong>. Still stuck?{" "}
              <Link className="underline" href="/contact">Contact Support</Link>.
            </div>
          </details>
        </div>
      </section>

      {/* Contact strip */}
      <section className="mt-8 card rounded-2xl p-5 shadow-sm brand-noise">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Need personal help?</h2>
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Our team responds within 1–2 business days.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/contact" className="btn-gradient-primary">Contact Support</Link>
            <Link href="/report" className="btn-outline">Report a Problem</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
