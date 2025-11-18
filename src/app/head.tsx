// src/app/head.tsx
import Script from "next/script";
import { headers } from "next/headers";

export default async function Head() {
  // headers() is async in your build; await it
  const h = await headers();
  const nonce = h.get("x-nonce") ?? undefined;

  // Minimal JSON-LD so we don't depend on seo.ts exports
  const baseUrl = process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://qwiksale.sale";
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QwikSale",
    url: baseUrl,
  };

  const siteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "QwikSale",
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}/search?q={query}`,
      "query-input": "required name=query",
    },
  };

  const prod = process.env["NODE_ENV"] === "production" && process.env["NEXT_PUBLIC_E2E"] !== "1";

  return (
    <>
      <meta name="color-scheme" content="light dark" />

      {prod ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
          <link rel="dns-prefetch" href="//res.cloudinary.com" />
        </>
      ) : null}

      {/* Theme bootstrap */}
      <Script id="theme-script" strategy="beforeInteractive" nonce={nonce}>{`(() => {
  try {
    var m = (localStorage.getItem('theme') || 'system').toLowerCase();
    var isSystem = m === 'system';
    var prefersDark = false;
    try { prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } catch {}
    var dark = (m === 'dark') || (isSystem && prefersDark);
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.setAttribute('data-theme-mode', m);
  } catch {}
})();`}</Script>

      {/* Structured data */}
      <Script id="ld-org" type="application/ld+json" nonce={nonce} strategy="afterInteractive">
        {JSON.stringify(orgJsonLd)}
      </Script>
      <Script id="ld-site" type="application/ld+json" nonce={nonce} strategy="afterInteractive">
        {JSON.stringify(siteJsonLd)}
      </Script>
    </>
  );
}
