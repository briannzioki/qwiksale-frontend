export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Sentry Test (dev)",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function SentryTestPage() {
  if (process.env["NODE_ENV"] === "production") {
    // Hide this page in production
    return (
      <div className="container-page bg-[var(--bg)] py-10 text-[var(--text)]">
        <p className="text-sm text-[var(--text-muted)]">Not available.</p>
      </div>
    );
  }

  return (
    <div className="container-page space-y-4 bg-[var(--bg)] py-10 text-[var(--text)]">
      <h1 className="text-xl font-semibold">Sentry Test (dev only)</h1>
      <p className="text-sm text-[var(--text-muted)]">
        This page exists so the Next type generator doesn’t reference missing modules.
      </p>
      <p className="text-sm">
        Try the API route at <code>/api/dev/sentry-test</code> to simulate an error.
      </p>
    </div>
  );
}
