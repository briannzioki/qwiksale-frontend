// src/app/lib/phone.ts

/**
 * Kenyan phone helpers
 * - Normalize to 12-digit MSISDN: 2547XXXXXXXX or 2541XXXXXXXX (digits only)
 * - Reject landlines and unknown prefixes
 * - Provide formatting, masking, equality checks, and WhatsApp links
 */

const MSISDN_RE = /^254(7|1)\d{8}$/;

/** Keep only digits. */
function digitsOnly(s: string) {
  return (s || "").replace(/\D+/g, "");
}

/** True if already a valid Kenyan mobile MSISDN: 2547XXXXXXXX or 2541XXXXXXXX. */
export function isValidKenyanMsisdn(msisdn: string): boolean {
  return MSISDN_RE.test(msisdn);
}

/**
 * Normalize any common Kenyan mobile input to a canonical MSISDN:
 *   - Accepts: 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX, 7XXXXXXXX, 1XXXXXXXX
 *   - Returns: "2547XXXXXXXX" or "2541XXXXXXXX" (12 digits), else null
 * Notes:
 *   - Landlines (020/0xx not starting 7/1) are not accepted.
 *   - Extra trailing digits are trimmed conservatively after normalization.
 */
export function normalizeKenyanPhone(input: string): string | null {
  if (!input) return null;

  let d = digitsOnly(input);

  // If starts with country code already
  if (d.startsWith("254")) {
    d = d.slice(0, 12); // cap to 12 just in case
    return isValidKenyanMsisdn(d) ? d : null;
  }

  // Local formats starting with 0, 7, or 1
  if (d.startsWith("0") && d.length >= 10) {
    // 07XXXXXXXX or 01XXXXXXXX → 2547/2541 + 8 digits
    d = "254" + d.slice(1, 10); // keep exactly 9 after 0 → total 12
    return isValidKenyanMsisdn(d) ? d : null;
  }

  if ((d.startsWith("7") || d.startsWith("1")) && d.length >= 9) {
    // 7XXXXXXXX or 1XXXXXXXX → 254 + 9 digits
    d = "254" + d.slice(0, 9);
    return isValidKenyanMsisdn(d) ? d : null;
  }

  // +254 without plus handled by first branch; anything else invalid
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

/**
 * Mask a valid MSISDN for logs/UI: keep first 6 & last 3 digits.
 * 254712345678 → 254712***678
 * Returns the input if not a valid MSISDN.
 */
export function maskKenyanMsisdn(msisdn: string): string {
  if (!isValidKenyanMsisdn(msisdn)) return msisdn;
  return msisdn.replace(/^(\d{6})\d{3}(\d{3})$/, "$1***$2");
}

/** Case-insensitive/format-insensitive equality check for Kenyan mobiles. */
export function equalsKenyanPhones(a?: string | null, b?: string | null): boolean {
  const na = a ? normalizeKenyanPhone(a) : null;
  const nb = b ? normalizeKenyanPhone(b) : null;
  return !!na && na === nb;
}

/** WhatsApp deep-link (returns undefined if phone is invalid). */
export function makeWhatsAppLink(phone?: string, text?: string): string | undefined {
  const msisdn = phone ? normalizeKenyanPhone(phone) : null;
  if (!msisdn) return undefined;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${msisdn}${q}`;
}

/** Lightweight validator with user-friendly message. */
export function validateKenyanPhone(input: string): { ok: boolean; msisdn?: string; error?: string } {
  const msisdn = normalizeKenyanPhone(input);
  if (!msisdn) return { ok: false, error: "Enter a valid Kenyan mobile like 07XXXXXXXX or +2547XXXXXXXX." };
  return { ok: true, msisdn };
}
