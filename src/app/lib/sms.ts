// src/app/lib/sms.ts
import "server-only";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type SmsProvider = "africastalking" | "twilio" | "mock";

export type SmsResult = {
  ok: boolean;
  to: string;
  provider: SmsProvider;
  status?: number;
  messageId?: string;
  cost?: string;
  error?: string;
  raw?: unknown;
};

type SendOpts = {
  /** Force a specific provider, else env SMS_PROVIDER is used. */
  provider?: SmsProvider;
  /** Abort/timeout for the network call (ms). Default 10s. */
  timeoutMs?: number;
  /** Retries on transient errors. Default 1 (i.e., 2 total attempts). */
  retries?: number;
};

/* ------------------------------------------------------------------ */
/* Env + helpers                                                      */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT_MS = 10_000;

const ENV = {
  // Africa's Talking
  AT_USERNAME: process.env["AT_USERNAME"] || "",
  AT_API_KEY: process.env["AT_API_KEY"] || "",
  AT_SENDER_ID: process.env["AT_SENDER_ID"] || "QwikSale",

  // Twilio
  TWILIO_SID: process.env["TWILIO_SID"] || "",
  TWILIO_AUTH: process.env["TWILIO_AUTH"] || "",
  TWILIO_FROM: process.env["TWILIO_FROM"] || "",

  // selector
  SMS_PROVIDER: (process.env["SMS_PROVIDER"] as SmsProvider | undefined) || undefined,
};

/** Normalize Kenyan numbers → 2547XXXXXXXX or 2541XXXXXXXX */
export function normalizeMsisdnKE(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  let d = raw.replace(/\D+/g, "");

  // +2547/1XXXXXXXX or 2547/1XXXXXXXX
  if (d.startsWith("254") && (d[3] === "7" || d[3] === "1")) {
    d = d.slice(0, 12);
    return /^\d{12}$/.test(d) ? d : null;
  }
  // 07/01 XXXXXXXX → 2547/1XXXXXXXX
  if (/^07\d{8}$/.test(d) || /^01\d{8}$/.test(d)) return "254" + d.slice(1);
  // 7/1XXXXXXXX → 2547/1XXXXXXXX
  if (/^[71]\d{8}$/.test(d)) return "254" + d;
  return null;
}

/** Small fetch helper with timeout/abort */
async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ */
/* Africa's Talking implementation                                    */
/* ------------------------------------------------------------------ */

async function sendViaAfricaTalking(to: string, message: string, timeoutMs: number): Promise<SmsResult> {
  const p: SmsProvider = "africastalking";
  const { AT_USERNAME, AT_API_KEY, AT_SENDER_ID } = ENV;

  if (!AT_USERNAME || !AT_API_KEY) {
    return { ok: false, to, provider: p, error: "Missing AT_USERNAME/AT_API_KEY" };
  }

  const endpoint = "https://api.africastalking.com/version1/messaging";
  const cleanTo = String(to).slice(0, 20);
  const cleanMsg = String(message || "").slice(0, 459); // keep payload modest

  const form = new URLSearchParams({
    username: AT_USERNAME,
    to: cleanTo,
    message: cleanMsg,
    from: AT_SENDER_ID,
  });

  const res = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey: AT_API_KEY,
      },
      body: form.toString(),
    },
    timeoutMs
  );

  const status = res.status;
  let raw: any = null;
  try {
    raw = await res.json();
  } catch {
    raw = await res.text().catch(() => "");
  }

  if (!res.ok) {
    const errMsg =
      (raw && (raw.error || raw.Message)) ||
      `Africa's Talking error HTTP ${status}`;
    return { ok: false, to, provider: p, status, error: errMsg, raw };
  }

  // Success shape reference:
  // { SMSMessageData: { Message: "...", Recipients: [ { number, cost, status, messageId, statusCode } ] } }
  const r0 = raw?.SMSMessageData?.Recipients?.[0];
  const success = r0 && String(r0.status).toLowerCase() === "success";
  return {
    ok: !!success,
    to,
    provider: "africastalking" as const,
    status,
    messageId: r0?.messageId,
    cost: r0?.cost,
    error: success ? undefined : (raw?.Message || "Unknown AT error"),
    raw,
  };
}

/* ------------------------------------------------------------------ */
/* Twilio implementation                                              */
/* ------------------------------------------------------------------ */

async function sendViaTwilio(to: string, message: string, timeoutMs: number): Promise<SmsResult> {
  const p: SmsProvider = "twilio";
  const { TWILIO_SID, TWILIO_AUTH, TWILIO_FROM } = ENV;

  if (!TWILIO_SID || !TWILIO_AUTH || !TWILIO_FROM) {
    return { ok: false, to, provider: p, error: "Missing Twilio SID/AUTH/FROM" };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    TWILIO_SID
  )}/Messages.json`;

  const form = new URLSearchParams({
    To: `+${to}`, // E.164
    From: TWILIO_FROM,
    Body: message,
  });

  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64");

  const res = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
    timeoutMs
  );

  const status = res.status;
  let raw: any = null;
  try {
    raw = await res.json();
  } catch {
    raw = await res.text().catch(() => "");
  }

  if (!res.ok) {
    const err =
      (raw && (raw.message || raw.error)) ||
      `Twilio error HTTP ${status}`;
    return { ok: false, to, provider: "twilio" as const, status, error: err, raw };
  }

  // Typical success includes `sid`
  return {
    ok: true,
    to,
    provider: "twilio" as const,
    status,
    messageId: raw?.sid,
    raw,
  };
}

/* ------------------------------------------------------------------ */
/* Mock provider (dry run / tests)                                    */
/* ------------------------------------------------------------------ */

async function sendViaMock(to: string, message: string): Promise<SmsResult> {
  // eslint-disable-next-line no-console
  console.info("[sms:mock] to=%s msg=%s", to, message);
  return { ok: true, to, provider: "mock" as const, messageId: "dry_run" };
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Low-level Africa's Talking helper (kept for compatibility).
 * Prefer `sendSms()` unless you must force AT explicitly.
 */
export async function sendSmsAT(to: string, message: string): Promise<SmsResult> {
  const msisdn = normalizeMsisdnKE(to);
  if (!msisdn) {
    return { ok: false, to, provider: "africastalking" as const, error: "Invalid Kenyan phone" };
  }
  return sendViaAfricaTalking(msisdn, message, DEFAULT_TIMEOUT_MS);
}

/**
 * Primary SMS function with provider selection, normalization, and retries.
 * Set `SMS_PROVIDER=africastalking|twilio|mock` in env, or pass `opts.provider`.
 */
export async function sendSms(
  toRaw: string,
  message: string,
  opts: SendOpts = {}
): Promise<SmsResult> {
  const provider: SmsProvider = opts.provider || ENV.SMS_PROVIDER || "africastalking";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, Math.min(3, opts.retries ?? 1)); // cap to 3

  const msisdn =
    provider === "twilio"
      ? // Twilio expects E.164; we normalize then add + later
        normalizeMsisdnKE(toRaw)
      : normalizeMsisdnKE(toRaw);

  if (!msisdn) {
    return { ok: false, to: toRaw, provider, error: "Invalid Kenyan phone" };
  }

  let attempt = 0;
  let last: SmsResult = { ok: false, to: msisdn, provider: provider as SmsProvider };

  // Basic retry loop for transient network failures / 5xx
  while (attempt <= retries) {
    try {
      if (provider === "mock") {
        return await sendViaMock(msisdn, message);
      }
      if (provider === "twilio") {
        const res = await sendViaTwilio(msisdn, message, timeoutMs);
        if (res.ok || (res.status && res.status < 500)) return res;
        last = res;
      } else {
        // africastalking
        const res = await sendViaAfricaTalking(msisdn, message, timeoutMs);
        if (res.ok || (res.status && res.status < 500)) return res;
        last = res;
      }
    } catch (e: any) {
      last = {
        ok: false,
        to: msisdn,
        provider,
        error: e?.message || "Network/timeout",
      };
    }

    attempt += 1;
    if (attempt <= retries) {
      // small backoff
      const wait = 300 * attempt;
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  return last;
}
