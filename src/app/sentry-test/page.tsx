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
      <div className="container-page py-10">
        <p className="text-sm text-gray-500 dark:text-slate-400">Not available.</p>
      </div>
    );
  }

  return (
    <div className="container-page py-10 space-y-4">
      <h1 className="text-xl font-semibold">Sentry Test (dev only)</h1>
      <p className="text-sm text-gray-600 dark:text-slate-300">
        This page exists so the Next type generator doesn’t reference missing modules.
      </p>
      <p className="text-sm">
        Try the API route at <code>/api/dev/sentry-test</code> to simulate an error.
      </p>
    </div>
  );
}
