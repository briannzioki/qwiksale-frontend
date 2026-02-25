// src/app/api/pay/mpesa/callback/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Thin shim to keep MPESA_CALLBACK_URL=/api/pay/mpesa/callback working,
// while preserving the existing implementation at /api/mpesa/callback.
import {
  POST as BasePOST,
  GET as BaseGET,
  HEAD as BaseHEAD,
} from "../../../mpesa/callback/route";

/**
 * IMPORTANT:
 * - Do NOT consume the request body here. The base handler needs it.
 * - If you want a “wiring check”, only clone-and-peek.
 */
export async function POST(req: Request) {
  // Best-effort peek without consuming the real body (BasePOST will read it)
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      await req.clone().json();
    } else {
      await req.clone().text();
    }
  } catch {
    /* ignore */
  }

  return BasePOST(req);
}

/**
 * The base route might export 0-arg handlers in some versions,
 * so keep forwarding but tolerate signature differences.
 */
export async function GET(req: Request) {
  try {
    // @ts-ignore
    return await BaseGET(req);
  } catch {
    // @ts-ignore
    return await BaseGET();
  }
}

export async function HEAD(req: Request) {
  try {
    // @ts-ignore
    return await BaseHEAD(req);
  } catch {
    // @ts-ignore
    return await BaseHEAD();
  }
}