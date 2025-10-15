export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import NextAuth from "next-auth";
import { authOptions } from "./authOptions";


const handler = NextAuth(authOptions);

function noStore(res: Response) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  // Vary on Cookie so CDNs don’t cache authenticated responses
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function GET(...args: Parameters<typeof handler>) {
  const res = await handler(...args);
  return noStore(res);
}

export async function POST(...args: Parameters<typeof handler>) {
  const res = await handler(...args);
  return noStore(res);
}
