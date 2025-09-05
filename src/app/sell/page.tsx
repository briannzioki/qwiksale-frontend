// src/app/sell/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions"; // <-- from authOptions.ts
import SellClient from "./SellClient";

export default async function SellPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    // No server redirect (avoids loops). Let user click through.
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-xl card-surface p-6">
          <h1 className="text-2xl font-bold mb-2">Sign in required</h1>
          <p className="mb-4">You need to sign in to post a listing.</p>
          <a className="btn-primary" href="/signin?callbackUrl=%2Fsell">
            Sign in
          </a>
        </div>
      </div>
    );
  }

  // Pass only what you need; you can also fetch /api/me inside SellClient.
  return <SellClient />;
}
