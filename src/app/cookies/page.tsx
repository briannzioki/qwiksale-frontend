// src/app/cookies/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie Policy · QwikSale",
  description:
    "Learn how QwikSale uses cookies and similar technologies for authentication, security, analytics, and preferences.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "27 Dec 2025";

export default function CookiesPage() {
  return (
    <div className="container-page bg-[var(--bg)] py-10 text-[var(--text)]">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft">
        <div className="container-page py-8 text-white">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-white">
            Cookie Policy
          </h1>
          <p className="mt-1 text-sm text-white/80">
            Cookies help QwikSale keep you signed in, protect accounts, remember preferences,
            and understand what’s working.
          </p>
          <p className="mt-1 text-sm text-white/60">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="mt-8 prose max-w-3xl dark:prose-invert">
        <p className="text-sm">
          This Cookie Policy explains how QwikSale uses cookies and similar technologies
          (like local storage) on <strong>https://qwiksale.sale</strong>. For broader details
          about data processing, see our{" "}
          <Link href="/privacy" className="underline" prefetch={false}>
            Privacy Policy
          </Link>
          .
        </p>

        <h2 id="what-are-cookies">1) What are cookies?</h2>
        <p>
          Cookies are small text files stored on your device when you visit a website. They
          can be “session” cookies (deleted when you close your browser) or “persistent”
          cookies (stored for longer).
        </p>

        <h2 id="how-we-use">2) How we use cookies</h2>
        <p>We use cookies for:</p>
        <ul>
          <li>
            <strong>Auth & security</strong> (strictly necessary): keep you signed in and
            protect accounts from abuse.
          </li>
          <li>
            <strong>Preferences</strong>: remember settings like theme and remembered inputs.
          </li>
          <li>
            <strong>Performance/analytics</strong>: understand usage in aggregate so we can
            improve speed and reliability.
          </li>
        </ul>

        <h2 id="categories">3) Categories of cookies</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Why we use it</th>
              <th>Examples</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Strictly necessary</td>
              <td>Login sessions, CSRF protection, security controls</td>
              <td>Auth/session cookies, CSRF tokens</td>
            </tr>
            <tr>
              <td>Preferences</td>
              <td>Remember choices and reduce repetitive inputs</td>
              <td>Theme preference, remembered email</td>
            </tr>
            <tr>
              <td>Analytics</td>
              <td>Measure performance and usage (aggregated)</td>
              <td>Page views, error rates, performance metrics</td>
            </tr>
          </tbody>
        </table>

        <h2 id="local-storage">4) Local storage</h2>
        <p>
          Some features may use browser local storage for convenience (for example, remembering
          a last used email address or UI preferences). You can clear this in your browser
          settings.
        </p>

        <h2 id="manage">5) Managing cookies</h2>
        <ul>
          <li>
            Most browsers let you block or delete cookies. Check your browser settings for
            “Privacy” or “Site Data”.
          </li>
          <li>
            Blocking strictly necessary cookies may prevent sign-in or break key functionality.
          </li>
        </ul>

        <h2 id="contact">6) Contact</h2>
        <p>
          Questions? Email{" "}
          <a href="mailto:privacy@qwiksale.sale">privacy@qwiksale.sale</a> or use{" "}
          <Link href="/contact" className="underline" prefetch={false}>
            /contact
          </Link>
          .
        </p>

        <hr />
        <p className="text-xs opacity-75">
          This page is informational and does not replace legal advice. For jurisdiction-specific
          rights, see the Privacy Policy.
        </p>
      </div>
    </div>
  );
}
