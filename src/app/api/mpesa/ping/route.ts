// src/app/api/mpesa/ping/route.ts
import { NextResponse } from "next/server";
import { MPESA } from "@/app/lib/mpesa";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    env: MPESA.ENV,
    baseUrl: MPESA.BASE_URL,
    callback: MPESA.CALLBACK_URL,
    paybill: MPESA.PAYBILL_SHORTCODE ? "set" : "missing",
    till: MPESA.TILL_NUMBER ? "set" : "missing",
  });
}