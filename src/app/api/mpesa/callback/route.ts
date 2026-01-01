// src/app/api/mpesa/callback/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type MpesaItem = { Name?: string; Value?: string | number };
type MpesaCallback = {
  ResultCode?: number;
  ResultDesc?: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  CallbackMetadata?: { Item?: MpesaItem[] };
};

const CALLBACK_TOKEN = (process.env["MPESA_CALLBACK_TOKEN"] || "").trim();

function json(body: unknown, init: ResponseInit = {}) {
  const res = new NextResponse(JSON.stringify(body), init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Content-Type", "application/json; charset=utf-8");
  return res;
}

function itemsToMap(items: MpesaItem[] = []) {
  const out: Record<string, string | number> = {};
  for (const i of items) {
    const k = (i?.Name || "").trim();
    if (!k) continue;
    if (i.Value !== undefined) out[k] = i.Value;
  }
  return out;
}

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function coerceString(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
}

function digitsOnly(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = v.replace(/[^\d]/g, "");
  return d ? d : undefined;
}

/**
 * Daraja TransactionDate is YYYYMMDDHHmmss.
 * Treat as "timestamp-like" and store as a Date.
 * (If you need exact timezone, keep rawCallback as source-of-truth for audits.)
 */
function parseMpesaTimestamp(v: unknown): Date | undefined {
  const s = String(v ?? "").trim();
  if (!/^\d{14}$/.test(s)) return undefined;

  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const hh = Number(s.slice(8, 10));
  const mm = Number(s.slice(10, 12));
  const ss = Number(s.slice(12, 14));

  // Using UTC construction avoids "server-local" surprises.
  const dt = new Date(Date.UTC(y, m, d, hh, mm, ss));
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

async function readBody(req: Request): Promise<any> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  if (ct.includes("application/json")) {
    return await req.json().catch(() => ({}));
  }

  // Fallback: some clients send JSON with odd content-types
  const raw = await req.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

type UniqueWhere =
  | { checkoutRequestId: string }
  | { merchantRequestId: string }
  | { mpesaReceipt: string };

function isPaid(status: unknown) {
  const s = String(status ?? "").toUpperCase();
  return s === "PAID" || s === "SUCCESS";
}

async function upsertMonotonicByUnique(where: UniqueWhere, incoming: {
  status: "PAID" | "FAILED";
  amount?: number | undefined;
  payerPhone?: string | undefined;
  paidAt?: Date | undefined;
  checkoutRequestId?: string | undefined;
  merchantRequestId?: string | undefined;
  mpesaReceipt?: string | undefined;
  rawCallback: any;
  resultDesc?: string | undefined;
}) {
  // Keep it schema-tolerant: use (prisma as any) to avoid hard schema coupling.
  const Payment = (prisma as any).payment;

  await prisma.$transaction(async (tx) => {
    const P = (tx as any).payment;

    // 1) Read current (if exists)
    const existing = await P.findUnique({
      where,
      select: {
        id: true,
        status: true,
        amount: true,
        payerPhone: true,
        paidAt: true,
        checkoutRequestId: true,
        merchantRequestId: true,
        mpesaReceipt: true,
      },
    }).catch(() => null);

    // 2) Compute monotonic update (never downgrade PAID)
    const nextStatus: "PAID" | "FAILED" =
      existing && isPaid(existing.status) ? "PAID" : incoming.status;

    const updateData: any = {
      status: nextStatus,
      rawCallback: incoming.rawCallback,
    };

    // Only set paidAt when PAID; never set paidAt on FAILED
    if (nextStatus === "PAID") {
      if (!existing?.paidAt && incoming.paidAt) updateData.paidAt = incoming.paidAt;
    } else {
      // keep existing paidAt if any (shouldn't exist), otherwise leave alone
    }

    // Fill in missing identifiers/receipt (don’t overwrite good values)
    if (!existing?.checkoutRequestId && incoming.checkoutRequestId) updateData.checkoutRequestId = incoming.checkoutRequestId;
    if (!existing?.merchantRequestId && incoming.merchantRequestId) updateData.merchantRequestId = incoming.merchantRequestId;
    if (!existing?.mpesaReceipt && incoming.mpesaReceipt) updateData.mpesaReceipt = incoming.mpesaReceipt;

    // Amount: don’t overwrite a non-zero amount (initiation is the trusted source)
    if (incoming.amount !== undefined) {
      const exAmt = Number(existing?.amount ?? 0);
      if (!Number.isFinite(exAmt) || exAmt <= 0) updateData.amount = incoming.amount;
    }

    // Phone: only fill if missing/blank
    if (incoming.payerPhone) {
      const exPhone = String(existing?.payerPhone ?? "").trim();
      if (!exPhone) updateData.payerPhone = incoming.payerPhone;
    }

    // resultDesc is useful but may not exist in schema; keep it inside rawCallback already.
    // If you DO have resultDesc/resultCode columns, add them here safely later.

    // 3) Create if missing; else update
    if (!existing) {
      const createData: any = {
        status: nextStatus,
        method: "MPESA",
        currency: "KES",
        amount: incoming.amount ?? 0,
        payerPhone: incoming.payerPhone ?? "",
        rawCallback: incoming.rawCallback,

        // identifiers
        checkoutRequestId: incoming.checkoutRequestId ?? null,
        merchantRequestId: incoming.merchantRequestId ?? null,
        mpesaReceipt: incoming.mpesaReceipt ?? null,

        // paidAt only for PAID
        paidAt: nextStatus === "PAID" ? (incoming.paidAt ?? new Date()) : null,
      };

      try {
        await P.create({ data: createData });
        return;
      } catch {
        // race: someone created concurrently; fall through to update
      }
    }

    await P.update({ where, data: updateData });
  });
}

export async function POST(req: Request) {
  // SAFARICOM: always ACK 200 quickly; never throw non-200 on processing failures.
  try {
    // Optional shared-secret check (still ACK 200 to prevent endless retries)
    if (CALLBACK_TOKEN) {
      const tok =
        req.headers.get("x-callback-token") ||
        req.headers.get("x-callback-secret") ||
        "";
      if (tok.trim() !== CALLBACK_TOKEN) {
        // eslint-disable-next-line no-console
        console.warn("[mpesa] callback token mismatch (ignored)");
        return json({ ok: true, ignored: true }, { status: 200 });
      }
    }

    const body = await readBody(req);

    // Common Daraja STK callback shape: Body.stkCallback
    const cb: MpesaCallback | undefined =
      (body as any)?.Body?.stkCallback ?? (body as any)?.stkCallback;

    if (!cb) {
      // eslint-disable-next-line no-console
      console.warn("[mpesa] missing stkCallback", {
        keys: body && typeof body === "object" ? Object.keys(body) : [],
      });
      return json({ ok: true }, { status: 200 });
    }

    const ResultCode = typeof cb.ResultCode === "number" ? cb.ResultCode : coerceNumber(cb.ResultCode);
    const ResultDesc = coerceString(cb.ResultDesc);
    const CheckoutRequestID = coerceString(cb.CheckoutRequestID);
    const MerchantRequestID = coerceString(cb.MerchantRequestID);

    const meta = itemsToMap(cb.CallbackMetadata?.Item ?? []);
    const amountNum = coerceNumber(meta["Amount"]);
    const amount = amountNum !== undefined ? Math.round(amountNum) : undefined;

    const receipt = coerceString(meta["MpesaReceiptNumber"]);
    const phone = digitsOnly(coerceString(meta["PhoneNumber"]));
    const paidAt = parseMpesaTimestamp(meta["TransactionDate"]);

    const status: "PAID" | "FAILED" = Number(ResultCode) === 0 ? "PAID" : "FAILED";

    // Choose best unique key to dedupe by:
    // 1) CheckoutRequestID (best)
    // 2) MerchantRequestID (good)
    // 3) Receipt (only for successful payments; may be missing on failure)
    const where: UniqueWhere | null =
      CheckoutRequestID ? { checkoutRequestId: CheckoutRequestID } :
      MerchantRequestID ? { merchantRequestId: MerchantRequestID } :
      receipt ? { mpesaReceipt: receipt } :
      null;

    if (!where) {
      // No dedupe key; best effort store one record, but never fail the ACK
      try {
        await (prisma as any).payment.create({
          data: {
            status,
            method: "MPESA",
            currency: "KES",
            amount: amount ?? 0,
            payerPhone: phone ?? "",
            paidAt: status === "PAID" ? (paidAt ?? new Date()) : null,
            rawCallback: body,
            mpesaReceipt: receipt ?? null,
          },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[mpesa] create fallback failed (ack anyway)", e);
      }

      return json({ ok: true, status, resultDesc: ResultDesc ?? null }, { status: 200 });
    }

    // Persist idempotently + monotonic
    try {
      await upsertMonotonicByUnique(where, {
        status,
        amount,
        payerPhone: phone,
        paidAt: status === "PAID" ? (paidAt ?? new Date()) : undefined,
        checkoutRequestId: CheckoutRequestID,
        merchantRequestId: MerchantRequestID,
        mpesaReceipt: receipt,
        rawCallback: body,
        resultDesc: ResultDesc,
      });
    } catch (dbErr) {
      // eslint-disable-next-line no-console
      console.warn("[mpesa] DB persist error (ack anyway):", dbErr);
    }

    return json({ ok: true, status, resultDesc: ResultDesc ?? null }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[mpesa] callback parse error (ack anyway):", err);
    return json({ ok: true }, { status: 200 });
  }
}

export async function GET() {
  return json({ status: "callback alive" }, { status: 200 });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
