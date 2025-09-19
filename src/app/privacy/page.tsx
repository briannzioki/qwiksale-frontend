// src/app/privacy/page.tsx

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — QwikSale",
  description:
    "How QwikSale collects, uses, shares, and protects your information, plus your choices and rights (GDPR, CPRA, Kenya DPA).",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "05 Sep 2025"; // Update on every material change

export default function PrivacyPage() {
  return (
    <div className="container-page py-10">
      {/* Hero */}
      <div className="rounded-2xl p-6 text-white shadow-soft bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <h1 className="text-2xl md:text-3xl font-extrabold">Privacy Policy</h1>
        <p className="text-white/90">
          We’re committed to privacy by design. This policy explains what we collect, how we use it,
          who we share it with, and your rights.
        </p>
        <p className="mt-1 text-white/70 text-sm">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="mt-8 prose dark:prose-invert max-w-3xl">
        <p className="text-sm">
          This Privacy Policy applies to the QwikSale marketplace available at{" "}
          <strong>https://qwiksale.sale</strong> and related services (the “Services”). By using
          the Services you agree to this Policy and our{" "}
          <a href="/terms" className="underline">
            Terms of Service
          </a>
          .
        </p>

        <h2 id="who-we-are">1) Who we are &amp; how to contact us</h2>
        <ul>
          <li>
            <strong>Controller:</strong> QwikSale (“we”, “us”, “our”).
          </li>
          <li>
            <strong>Contact:</strong> <a href="mailto:privacy@qwiksale.sale">privacy@qwiksale.sale</a>{" "}
            (preferred) or <a href="/contact">/contact</a>.
          </li>
          <li>
            <strong>Data Protection Lead (DPL):</strong> privacy@qwiksale.sale
          </li>
          <li>
            <strong>Registered address:</strong> (Add your legal/registered address here.)
          </li>
        </ul>

        <h2 id="what-we-collect">2) Information we collect</h2>
        <h3>2.1 You provide</h3>
        <ul>
          <li>
            <strong>Account &amp; profile:</strong> name, email, username, password (hashed),
            avatar, optional WhatsApp/phone, location, bio, social links.
          </li>
          <li>
            <strong>Listings &amp; content:</strong> titles, descriptions, photos, category, price,
            location.
          </li>
          <li>
            <strong>Communications:</strong> messages, support requests, feedback, and survey
            responses.
          </li>
          <li>
            <strong>Payments:</strong> donation/upgrade signals and receipts (e.g., M-Pesa request
            IDs and status). <em>We never collect or store your M-Pesa PIN.</em>
          </li>
        </ul>

        <h3>2.2 Collected automatically</h3>
        <ul>
          <li>
            <strong>Usage &amp; diagnostics:</strong> device/browser type, pages viewed, actions,
            timestamps, IP address, approximate location, crash logs.
          </li>
          <li>
            <strong>Cookies/SDKs:</strong> session cookies to keep you signed in, analytics to
            improve performance, and security cookies to prevent abuse.
          </li>
        </ul>

        <h3>2.3 From third parties</h3>
        <ul>
          <li>
            <strong>Auth providers (e.g., Google):</strong> name, email, avatar—if you choose to
            sign in with them.
          </li>
          <li>
            <strong>Safety &amp; fraud partners:</strong> signals that help protect our community.
          </li>
        </ul>

        <h2 id="how-we-use">3) How we use information (purposes &amp; legal bases)</h2>
        <table>
          <thead>
            <tr>
              <th>Purpose</th>
              <th>Examples</th>
              <th>Legal basis (EU/UK)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Provide &amp; maintain Services</td>
              <td>Accounts, listings, search, favorites, messaging</td>
              <td>Contract performance; Legitimate interests</td>
            </tr>
            <tr>
              <td>Payments &amp; receipts</td>
              <td>M-Pesa STK push, donation/upgrade logs</td>
              <td>Contract performance; Legal obligation</td>
            </tr>
            <tr>
              <td>Safety &amp; fraud prevention</td>
              <td>Rate limiting, abuse detection, account protection</td>
              <td>Legitimate interests; Legal obligation</td>
            </tr>
            <tr>
              <td>Improve &amp; analyze</td>
              <td>Performance metrics, feature usage</td>
              <td>Legitimate interests; Consent where required</td>
            </tr>
            <tr>
              <td>Communications</td>
              <td>Service updates, support replies</td>
              <td>Contract performance; Legitimate interests</td>
            </tr>
            <tr>
              <td>Marketing (optional)</td>
              <td>Newsletters, promotions</td>
              <td>Consent; Legitimate interests (where permitted)</td>
            </tr>
          </tbody>
        </table>

        <h2 id="sharing">4) Sharing &amp; disclosures</h2>
        <ul>
          <li>
            <strong>Public content:</strong> listings, store pages, usernames, some profile details
            are public by design.
          </li>
          <li>
            <strong>Processors:</strong> hosting, databases, storage/CDN, image processing,
            analytics, logging/monitoring, and payment gateways (e.g., Safaricom Daraja for M-Pesa).
            Processors act under contracts and only process data on our instructions.
          </li>
          <li>
            <strong>Legal/safety:</strong> we may disclose information to comply with laws, lawful
            requests, or to protect rights and safety.
          </li>
          <li>
            <strong>Business transfers:</strong> in a merger/acquisition, data may transfer under
            this Policy.
          </li>
        </ul>

        <h2 id="retention">5) Retention</h2>
        <p>
          We keep personal data only as long as necessary for the purposes above, to provide the
          Services, comply with legal obligations, resolve disputes, and enforce agreements.
        </p>
        <ul>
          <li>Account basics: kept while your account is active.</li>
          <li>Listings &amp; public content: kept until you remove them or your account is deleted.</li>
          <li>
            Payment records: retained per tax/accounting obligations (typically 5–7 years, depending
            on jurisdiction).
          </li>
          <li>Security logs: short to medium periods to detect and investigate abuse.</li>
        </ul>

        <h2 id="international">6) International transfers</h2>
        <p>
          We may process data outside your country. Where required, we implement safeguards such as
          Standard Contractual Clauses (SCCs) or equivalent, and ensure processors provide adequate
          protection. Kenya users are protected under the Data Protection Act, 2019 and Regulations.
        </p>

        <h2 id="your-rights">7) Your rights &amp; choices</h2>
        <h3>7.1 Global</h3>
        <ul>
          <li>Access, correction, deletion of your data (subject to lawful exceptions).</li>
          <li>Object to or restrict certain processing, where applicable.</li>
          <li>Data portability (structured, commonly used format) where applicable.</li>
          <li>Withdraw consent at any time (e.g., marketing), without affecting prior lawful use.</li>
        </ul>
        <p>
          To exercise rights, use <a href="/contact">/contact</a> or email{" "}
          <a href="mailto:privacy@qwiksale.sale">privacy@qwiksale.sale</a>. We may need to verify
          your identity.
        </p>

        <h3>7.2 EEA/UK (GDPR/UK GDPR)</h3>
        <ul>
          <li>You may lodge a complaint with your local Supervisory Authority.</li>
          <li>
            We rely on Contract performance, Legitimate interests, Consent, and Legal obligations.
          </li>
        </ul>

        <h3>7.3 Kenya (DPA 2019)</h3>
        <ul>
          <li>Rights include access, correction, objection to processing, and deletion.</li>
          <li>
            You may contact the Office of the Data Protection Commissioner (ODPC) for guidance or
            complaints.
          </li>
        </ul>

        <h3>7.4 U.S. California (CCPA/CPRA)</h3>
        <ul>
          <li>
            Rights to know, delete, correct, and to opt out of “selling” or “sharing” personal
            information (as defined by CPRA).
          </li>
          <li>
            We don’t sell personal information for money. If we ever use targeted advertising that
            constitutes “sharing,” you can opt out here:{" "}
            <a href="/privacy/do-not-sell-or-share">Do Not Sell or Share</a>.
          </li>
        </ul>

        <h2 id="cookies">8) Cookies &amp; analytics</h2>
        <ul>
          <li>
            <strong>Strictly necessary:</strong> auth/session, security, basic functionality.
          </li>
          <li>
            <strong>Performance/analytics:</strong> usage and performance metrics (aggregated).
          </li>
          <li>
            <strong>Preferences:</strong> theme, language, remembered inputs.
          </li>
          <li>
            <strong>Marketing (if enabled):</strong> only with consent where required.
          </li>
        </ul>
        <p>
          You can manage cookies in your browser. Blocking some cookies may impact functionality. If
          we use consent banners, your preferences are honored and can be changed any time.
        </p>

        <h2 id="marketing">9) Marketing communications</h2>
        <p>
          You can unsubscribe from marketing emails using the link in the email footer or by
          contacting us. Service/transactional emails (e.g., receipts, security notices) will still
          be sent.
        </p>

        <h2 id="automated">10) Automated decision-making</h2>
        <p>
          We do not make decisions producing legal or similarly significant effects solely via
          automated processing. We may use automated signals (e.g., spam/fraud detection) to protect
          the platform; manual review is available.
        </p>

        <h2 id="security">11) Security</h2>
        <p>
          We use administrative, technical, and organizational measures appropriate to the risk
          (e.g., encryption in transit, hardened infrastructure, least-privilege access). No system
          is 100% secure—please use a strong, unique password and enable available protections.
        </p>

        <h2 id="user-generated">12) User-generated content</h2>
        <p>
          Content you submit (e.g., listings, photos) may be public by design. Think carefully
          before posting personal information in public fields.
        </p>

        <h2 id="children">13) Children</h2>
        <p>
          The Services are not directed to children under the age required by local law to consent
          to data processing. If we learn we’ve collected data from a child, we’ll take reasonable
          steps to delete it.
        </p>

        <h2 id="account">14) Account deletion &amp; data portability</h2>
        <ul>
          <li>
            You can delete your account in <a href="/settings">Settings</a> or ask us at{" "}
            <a href="mailto:privacy@qwiksale.sale">privacy@qwiksale.sale</a>.
          </li>
          <li>
            Some records (e.g., fraud prevention, tax/financial) may be retained as permitted by
            law.
          </li>
          <li>
            To request an export of your data, contact us. We’ll provide a portable format where
            required by law.
          </li>
        </ul>

        <h2 id="third-parties">15) Third-party links</h2>
        <p>
          Our Services may link to third-party sites. Their privacy practices are governed by their
          own policies. Review them before providing personal information.
        </p>

        <h2 id="dntr">16) “Do Not Track”</h2>
        <p>
          We currently do not respond to browser “Do Not Track” signals. You can control cookies in
          your browser and opt out of marketing where offered.
        </p>

        <h2 id="changes">17) Changes to this Policy</h2>
        <p>
          We may update this Policy from time to time. We’ll post the revised version with a new
          “Last updated” date and, where appropriate, provide additional notice.
        </p>

        <h2 id="contact">18) Contact, appeals &amp; complaints</h2>
        <ul>
          <li>
            Email: <a href="mailto:privacy@qwiksale.sale">privacy@qwiksale.sale</a>
          </li>
          <li>
            Web: <a href="/contact">/contact</a>
          </li>
          <li>
            If you believe we have not resolved your concern, you may appeal to us at the same
            address (subject “Privacy Appeal”) or contact your data protection authority (e.g., ODPC
            in Kenya, your EU/UK Supervisory Authority, or your state AG in the U.S.).
          </li>
        </ul>

        <hr />
        <p className="text-xs opacity-75">
          This summary is provided for transparency and ease of understanding. It does not replace
          applicable law or any rights granted to you thereunder.
        </p>
      </div>
    </div>
  );
}
