export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

export const metadata = {
  title: "Goodbye 👋 | QwikSale",
  robots: { index: false, follow: false },
};

export default function GoodbyePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center p-6 text-center">
      <div className="rounded-3xl border border-gray-200 p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Your account has been deleted</h1>
        <p className="mt-3 text-gray-600">
          We’re sorry to see you go. If this was a mistake or you change your mind,
          you’re always welcome to come back.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            href="/"
            className="w-full rounded-2xl bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
          >
            Go to homepage
          </Link>
          <Link
            href="/signin"
            className="w-full rounded-2xl px-4 py-2 ring-1 ring-gray-300 hover:bg-gray-50"
          >
            Create a new account / Sign in
          </Link>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Need help? <Link href="/support" className="underline">Contact support</Link>
        </p>
      </div>
    </main>
  );
}
