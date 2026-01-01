// mpesa-callback.e2e.spec.ts
import { test, expect } from "@playwright/test";
import path from "path";

type AnyObj = Record<string, any>;

function buildStkCallbackPayload(params: {
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: number;
  receipt?: string;
  phone?: string;
  amount?: number;
  transactionDate?: string;
}): AnyObj {
  const {
    checkoutRequestId,
    merchantRequestId,
    resultCode,
    receipt = "E2E123ABC",
    phone = "254700000001",
    amount = 10,
    transactionDate = "20250101123030",
  } = params;

  return {
    Body: {
      stkCallback: {
        MerchantRequestID: merchantRequestId,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: resultCode === 0 ? "Success" : "Failed",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: amount },
            { Name: "MpesaReceiptNumber", Value: receipt },
            { Name: "PhoneNumber", Value: phone },
            { Name: "TransactionDate", Value: transactionDate },
          ],
        },
      },
    },
  };
}

async function tryGetPrisma(): Promise<any | null> {
  try {
    const modPath = path.join(process.cwd(), "src", "app", "lib", "prisma");
    const mod = await import(modPath);
    return (mod as any).prisma ?? null;
  } catch {
    return null;
  }
}

test.describe("mpesa callback wiring", () => {
  test("callback endpoints are reachable and not redirected by middleware", async ({ request }) => {
    const r1 = await request.get("/api/pay/mpesa/callback");
    expect(r1.status()).toBe(200);
    expect((r1.headers()["content-type"] || "").toLowerCase()).toContain("application/json");

    const r2 = await request.get("/api/mpesa/callback");
    expect(r2.status()).toBe(200);
    expect((r2.headers()["content-type"] || "").toLowerCase()).toContain("application/json");
  });

  test("callback always acks 200 even for weird payloads", async ({ request }) => {
    const r = await request.post("/api/pay/mpesa/callback", {
      data: { notDaraja: true, hello: "world" },
      headers: { "content-type": "application/json" },
    });

    expect(r.status()).toBe(200);
    const j = await r.json().catch(() => null);
    expect(j && typeof j === "object").toBeTruthy();
    expect((j as any).ok).toBe(true);
  });

  test("idempotency and monotonic status: duplicate callbacks do not downgrade PAID", async ({ request }) => {
    const now = Date.now();
    const checkoutRequestId = `ws_CO_${now}`;
    const merchantRequestId = `ws_MR_${now}`;
    const receipt = `E2E${now}`.slice(0, 12);

    const prisma = await tryGetPrisma();

    // Best effort cleanup before
    if (prisma) {
      try {
        await prisma.payment.deleteMany({ where: { checkoutRequestId } as any });
      } catch {
        /* ignore */
      }
    }

    const successPayload = buildStkCallbackPayload({
      checkoutRequestId,
      merchantRequestId,
      resultCode: 0,
      receipt,
    });

    const failPayload = buildStkCallbackPayload({
      checkoutRequestId,
      merchantRequestId,
      resultCode: 1,
      receipt,
    });

    // Send success to new path
    const a = await request.post("/api/pay/mpesa/callback", {
      data: successPayload,
      headers: { "content-type": "application/json" },
    });
    expect(a.status()).toBe(200);
    const aj = await a.json().catch(() => null);
    expect(aj && typeof aj === "object").toBeTruthy();
    expect((aj as any).ok).toBe(true);

    // Send same success again to legacy path (should dedupe)
    const b = await request.post("/api/mpesa/callback", {
      data: successPayload,
      headers: { "content-type": "application/json" },
    });
    expect(b.status()).toBe(200);
    const bj = await b.json().catch(() => null);
    expect(bj && typeof bj === "object").toBeTruthy();
    expect((bj as any).ok).toBe(true);

    // Try to downgrade with a failed callback (must remain PAID if you implemented monotonic)
    const c = await request.post("/api/pay/mpesa/callback", {
      data: failPayload,
      headers: { "content-type": "application/json" },
    });
    expect(c.status()).toBe(200);
    const cj = await c.json().catch(() => null);
    expect(cj && typeof cj === "object").toBeTruthy();
    expect((cj as any).ok).toBe(true);

    // If prisma is available, assert DB behavior
    if (prisma) {
      const rows = await prisma.payment.findMany({
        where: { checkoutRequestId } as any,
        take: 10,
      });

      expect(rows.length).toBe(1);

      const status = String((rows[0] as any).status || "").toUpperCase();
      expect(status).toBe("PAID");

      // cleanup after
      try {
        await prisma.payment.deleteMany({ where: { checkoutRequestId } as any });
      } catch {
        /* ignore */
      }
    }
  });
});
