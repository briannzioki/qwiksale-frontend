// src/app/api/mpesa/stk-query/route.ts
import { NextResponse } from "next/server";
import { MpesaError, stkQuery } from "@/app/lib/mpesa";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // Accept a few shapes to be “bullet proof”
    const checkoutRequestId =
      body?.checkoutRequestId ?? body?.CheckoutRequestID ?? body?.checkout_request_id;

    if (!checkoutRequestId) {
      return NextResponse.json({ error: "checkoutRequestId required" }, { status: 400 });
    }

    const mode = body?.mode === "till" ? "till" : body?.mode === "paybill" ? "paybill" : undefined;

    const data = await stkQuery({ checkoutRequestId: String(checkoutRequestId), ...(mode ? { mode } : {}) });

    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof MpesaError) {
      return NextResponse.json(
        {
          error: e.message,
          code: e.code ?? undefined,
          status: e.status ?? undefined,
          data: e.data ?? undefined,
        },
        { status: e.status && e.status >= 400 ? e.status : 502 },
      );
    }

    return NextResponse.json({ error: "Unexpected error", message: String((e as any)?.message ?? e) }, { status: 500 });
  }
}