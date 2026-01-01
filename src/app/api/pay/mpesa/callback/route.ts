// src/app/api/pay/mpesa/callback/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Thin shim to keep MPESA_CALLBACK_URL=/api/pay/mpesa/callback working,
// while preserving the existing implementation at /api/mpesa/callback.
import {
  POST as BasePOST,
  GET as BaseGET,
  HEAD as BaseHEAD,
} from "../../../mpesa/callback/route";

export async function POST(req: Request) {
  // Best effort JSON touch for wiring checks, without consuming the body that BasePOST reads.
  try {
    await req.clone().json();
  } catch {
    /* ignore */
  }
  return BasePOST(req);
}

export async function GET(_req: Request) {
  return BaseGET();
}

export async function HEAD(_req: Request) {
  return BaseHEAD();
}
