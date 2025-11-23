// src/app/terms/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | QwikSale",
  description:
    "Read the Terms of Service that govern your use of QwikSale, including account rules, listings, payments, and dispute resolution.",
};

const EFFECTIVE_DATE = "2025-01-01"; // ← update when you ship changes

export default function TermsPage() {
  return (
    <div className="container-page py-10">
      <div className="prose max-w-3xl dark:prose-invert">
        <h1>Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          Effective:{" "}
          <time dateTime={EFFECTIVE_DATE}>{EFFECTIVE_DATE}</time>
        </p>
        <p>
          These Terms of Service (“Terms”) govern your access to and use of
          QwikSale’s website, apps, and services (collectively, the “Service”).
          By accessing or using the Service, you agree to be bound by these
          Terms.
        </p>
        <div className="rounded-xl border border-border bg-muted p-3 text-sm">
          <strong>Not legal advice.</strong> This is a template for product use.
          Replace with counsel-approved language before launch.
        </div>

        <h2 id="summary">Quick Summary</h2>
        <ul>
          <li>
            You must be 18+ (or the age of majority in your region) to use
            QwikSale.
          </li>
          <li>
            You are responsible for your listings, messages, and transactions.
          </li>
          <li>No illegal / unsafe items, misleading listings, or spam.</li>
          <li>
            Payments (e.g., M-Pesa) are processed by third parties; certain
            actions may be final and fees may apply.
          </li>
          <li>
            We can suspend or remove accounts that violate these Terms.
          </li>
        </ul>

        <h2 id="toc">Contents</h2>
        <ol>
          <li>
            <a href="#eligibility">Eligibility</a>
          </li>
          <li>
            <a href="#account">Accounts &amp; Security</a>
          </li>
          <li>
            <a href="#listings">Listings &amp; Transactions</a>
          </li>
          <li>
            <a href="#prohibited">Prohibited Items &amp; Conduct</a>
          </li>
          <li>
            <a href="#fees">Fees, Payments &amp; Refunds</a>
          </li>
          <li>
            <a href="#subscriptions">Subscriptions</a>
          </li>
          <li>
            <a href="#content">Your Content &amp; Licenses</a>
          </li>
          <li>
            <a href="#privacy">Privacy</a>
          </li>
          <li>
            <a href="#notices">Communications &amp; Notices</a>
          </li>
          <li>
            <a href="#takedown">Takedown &amp; Reporting</a>
          </li>
          <li>
            <a href="#termination">Suspension &amp; Termination</a>
          </li>
          <li>
            <a href="#warranty">Disclaimers</a>
          </li>
          <li>
            <a href="#liability">Limitation of Liability</a>
          </li>
          <li>
            <a href="#indemnity">Indemnity</a>
          </li>
          <li>
            <a href="#law">Governing Law &amp; Disputes</a>
          </li>
          <li>
            <a href="#changes">Changes to the Service or Terms</a>
          </li>
          <li>
            <a href="#contact">Contact</a>
          </li>
        </ol>

        <h2 id="eligibility">1) Eligibility</h2>
        <p>
          You must be at least 18 years old (or the age of majority in your
          jurisdiction) and capable of forming a binding contract to use the
          Service. If you use the Service on behalf of a business, you represent
          that you are authorized to bind that business to these Terms.
        </p>

        <h2 id="account">2) Accounts &amp; Security</h2>
        <ul>
          <li>Provide accurate information and keep it up to date.</li>
          <li>
            You are responsible for safeguarding your login credentials.
          </li>
          <li>
            Notify us promptly of any unauthorized use of your account.
          </li>
        </ul>

        <h2 id="listings">3) Listings &amp; Transactions</h2>
        <ul>
          <li>
            You are responsible for the accuracy of your listings (title, price,
            condition, photos) and for complying with applicable laws.
          </li>
          <li>
            Meet safely: prefer public places; verify items before paying;
            avoid sharing sensitive information.
          </li>
          <li>
            QwikSale is a marketplace platform and is not a party to
            transactions between buyers and sellers unless expressly stated.
          </li>
        </ul>

        <h2 id="prohibited">4) Prohibited Items &amp; Conduct</h2>
        <p>Do not post or transact on:</p>
        <ul>
          <li>Illegal items, stolen goods, counterfeit products, or recalled items.</li>
          <li>Weapons, explosives, hazardous materials, or regulated substances.</li>
          <li>
            Items that infringe intellectual property rights or violate
            third-party terms.
          </li>
          <li>
            Fraud, impersonation, harassment, hate speech, or any activity that
            harms other users or the platform.
          </li>
          <li>Spam, multi-posting, or keyword stuffing.</li>
        </ul>

        <h2 id="fees">5) Fees, Payments &amp; Refunds</h2>
        <ul>
          <li>
            Fees (if any) will be disclosed at checkout or within the Service.
            Fees are generally non-refundable unless required by law.
          </li>
          <li>
            Payments may be handled via third-party processors (e.g.,
            M-Pesa/Daraja). By paying, you also agree to the processor’s terms
            and privacy policy.
          </li>
          <li>
            Chargebacks, reversals, or disputes may result in account
            limitations or recovery actions as permitted by law.
          </li>
        </ul>

        <h2 id="subscriptions">6) Subscriptions</h2>
        <ul>
          <li>
            Upgrades (e.g., Gold/Platinum) are billed in advance and renew on
            the stated term unless cancelled.
          </li>
          <li>
            Benefits expire at the end of the paid term. We may change
            subscription pricing and benefits with reasonable notice.
          </li>
          <li>
            Unless required by law, subscription payments are non-refundable
            once the term starts.
          </li>
        </ul>

        <h2 id="content">7) Your Content &amp; Licenses</h2>
        <ul>
          <li>
            You retain ownership of content you upload (e.g., photos,
            descriptions). You grant QwikSale a worldwide, non-exclusive,
            royalty-free license to host, display, and distribute your content
            solely to operate and promote the Service.
          </li>
          <li>
            You represent that you have all necessary rights to post your
            content and that it does not infringe third-party rights.
          </li>
        </ul>

        <h2 id="privacy">8) Privacy</h2>
        <p>
          Our <a href="/privacy">Privacy Policy</a> explains how we collect,
          use, and protect your data. By using the Service, you agree to the
          Privacy Policy.
        </p>

        <h2 id="notices">9) Communications &amp; Notices</h2>
        <p>
          We may send you transactional messages (e.g., account, security,
          purchase updates) and, where permitted, service announcements or
          marketing. You can manage certain preferences in your account settings
          or by following opt-out instructions in messages.
        </p>

        <h2 id="takedown">10) Takedown &amp; Reporting</h2>
        <p>
          We may remove content or suspend accounts that violate these Terms or
          the law. To report issues or alleged infringement, contact{" "}
          <a href="mailto:support@qwiksale.sale">support@qwiksale.sale</a>.
        </p>

        <h2 id="termination">11) Suspension &amp; Termination</h2>
        <p>
          We may suspend or terminate access to the Service at our discretion,
          including for violations of these Terms, unlawful activity, or risk to
          other users. You may stop using the Service at any time.
        </p>

        <h2 id="warranty">12) Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM
          EXTENT PERMITTED BY LAW, QWIKSALE DISCLAIMS ALL WARRANTIES, EXPRESS OR
          IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          AND NON-INFRINGEMENT. WE DO NOT GUARANTEE AVAILABILITY, ACCURACY, OR
          RELIABILITY OF THE SERVICE OR USER CONTENT.
        </p>

        <h2 id="liability">13) Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, QWIKSALE AND ITS AFFILIATES
          WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
          EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA,
          OR GOODWILL. OUR AGGREGATE LIABILITY ARISING FROM OR RELATING TO THE
          SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO
          QWIKSALE IN THE 3 MONTHS BEFORE THE EVENT GIVING RISE TO LIABILITY OR
          (B) KES 10,000.
        </p>

        <h2 id="indemnity">14) Indemnity</h2>
        <p>
          You will defend, indemnify, and hold harmless QwikSale, its
          affiliates, and their respective officers, directors, employees, and
          agents from any claims, liabilities, damages, losses, and expenses
          (including reasonable legal fees) arising out of or related to your
          use of the Service or violation of these Terms or applicable law.
        </p>

        <h2 id="law">15) Governing Law &amp; Disputes</h2>
        <p>
          These Terms are governed by the laws of Kenya, without regard to
          conflict-of-law principles. You agree to the exclusive jurisdiction
          and venue of the courts located in Nairobi, Kenya, for all disputes
          that are not subject to mandatory arbitration or other dispute
          processes required by law.
        </p>

        <h2 id="changes">16) Changes to the Service or Terms</h2>
        <p>
          We may modify the Service or these Terms at any time. Material changes
          will be posted on this page (or within the Service) with an updated
          effective date. Your continued use after changes become effective
          constitutes acceptance.
        </p>

        <h2 id="contact">17) Contact</h2>
        <p>
          Questions? Email{" "}
          <a href="mailto:support@qwiksale.sale">
            support@qwiksale.sale
          </a>
          .
        </p>

        <hr />
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} QwikSale. All rights reserved.
        </p>
      </div>
    </div>
  );
}
