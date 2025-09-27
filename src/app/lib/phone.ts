// src/app/lib/phone.ts

/**
 * Kenyan phone helpers
 * - Normalize to 12-digit MSISDN: 2547XXXXXXXX or 2541XXXXXXXX (digits only)
 * - Reject landlines and unknown prefixes
 * - Provide formatting, masking, equality checks, WhatsApp links, and E.164
 */

const MSISDN_RE = /^254(7|1)\d{8}$/;

/** Keep only ASCII digits. */
function digitsOnly(s: string) {
  return (s || "").replace(/\D+/g, "");
}

/** True if already a valid Kenyan mobile MSISDN: 2547XXXXXXXX or 2541XXXXXXXX. */
export function isValidKenyanMsisdn(msisdn: string): boolean {
  return MSISDN_RE.test(msisdn);
}

/**
 * Normalize common Kenyan mobile input to canonical MSISDN:
 * Accepts: 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX, 7XXXXXXXX, 1XXXXXXXX,
 *          002547XXXXXXXX, 25407XXXXXXXX (fixes accidental extra 0)
 * Returns: "2547XXXXXXXX" or "2541XXXXXXXX" (12 digits), else null.
 * Notes:
 * - Landlines (020 / 0xx not starting 7/1) are not accepted.
 * - Extra trailing digits are trimmed conservatively after normalization.
 */
export function normalizeKenyanPhone(input: string): string | null {
  if (!input) return null;

  let d = digitsOnly(input);

  // Handle "00" international prefix (e.g., 002547...)
  if (d.startsWith("00")) d = d.slice(2);

  // Fix common mistake: 2540XXXXXXXX -> 254XXXXXXXX
  if (d.startsWith("2540")) d = "254" + d.slice(4);

  // Already with country code
  if (d.startsWith("254")) {
    d = d.slice(0, 12); // cap to 12 digits
    return isValidKenyanMsisdn(d) ? d : null;
  }

  // Local with leading 0 (07 / 01)
  if (d.startsWith("0") && d.length >= 10) {
    // Ensure exactly 10 digits for the local form before converting
    // 0 + 9 = 10 → 07/01 + 8 more digits
    const local10 = d.slice(0, 10);
    const body9 = local10.slice(1); // drop leading 0
    const msisdn = "254" + body9;
    return isValidKenyanMsisdn(msisdn) ? msisdn : null;
  }

  // Local without leading 0 (7XXXXXXXX / 1XXXXXXXX)
  if ((d.startsWith("7") || d.startsWith("1")) && d.length >= 9) {
    const body9 = d.slice(0, 9);
    const msisdn = "254" + body9;
    return isValidKenyanMsisdn(msisdn) ? msisdn : null;
  }

  return null;
}

/**
 * Human-friendly local format:
 *  - 2547XXXXXXXX → "07X XXX XXXX"
 *  - 2541XXXXXXXX → "01X XXX XXXX"
 * Returns the input if not a valid MSISDN.
 */
export function formatKenyanLocal(msisdn: string): string {
  if (!isValidKenyanMsisdn(msisdn)) return msisdn;
  const head = msisdn.startsWith("2547") ? "07" + msisdn.slice(4, 5) : "01" + msisdn.slice(4, 5);
  const mid = msisdn.slice(5, 8);
  const tail = msisdn.slice(8, 12);
  return `${head} ${mid} ${tail}`;
}

/** International display format: +2547XXXXXXXX */
export function formatKenyanInternational(msisdn: string): string {
  return isValidKenyanMsisdn(msisdn) ? `+${msisdn}` : msisdn;
}

/** Convert to E.164 (+2547XXXXXXXX) if valid; else null. */
export function toE164Kenyan(input: string): string | null {
  const msisdn = normalizeKenyanPhone(input);
  return msisdn ? `+${msisdn}` : null;
}

/**
 * Mask a valid MSISDN for logs/UI: keep first 6 & last 3 digits.
 * 254712345678 → 254712***678
 * Returns the input if not a valid MSISDN.
 */
export function maskKenyanMsisdn(msisdn: string): string {
  if (!isValidKenyanMsisdn(msisdn)) return msisdn;
  return msisdn.replace(/^(\d{6})\d{3}(\d{3})$/, "$1***$2");
}

/** Case/format-insensitive equality check for Kenyan mobiles. */
export function equalsKenyanPhones(a?: string | null, b?: string | null): boolean {
  const na = a ? normalizeKenyanPhone(a) : null;
  const nb = b ? normalizeKenyanPhone(b) : null;
  return !!na && na === nb;
}

/** WhatsApp deep link (undefined if invalid). */
export function makeWhatsAppLink(phone?: string, text?: string): string | undefined {
  const msisdn = phone ? normalizeKenyanPhone(phone) : null;
  if (!msisdn) return undefined;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  // wa.me expects international number without the '+'
  return `https://wa.me/${msisdn}${q}`;
}

/** Lightweight validator with user-friendly message. */
export function validateKenyanPhone(input: string): { ok: boolean; msisdn?: string; error?: string } {
  const msisdn = normalizeKenyanPhone(input);
  if (!msisdn) return { ok: false, error: "Enter a valid Kenyan mobile like 07XXXXXXXX or +2547XXXXXXXX." };
  return { ok: true, msisdn };
}
