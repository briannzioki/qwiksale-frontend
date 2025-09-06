// src/lib/moderation.ts

/* ================================================
 * Text normalization / utilities
 * ================================================ */

function normalizeForCompare(s: string): string {
  // strip accents, normalize quotes/dashes, collapse whitespace, lower-case
  const deAccented = s.normalize?.("NFKD").replace(/\p{M}+/gu, "") ?? s;
  return deAccented
    .replace(/[’`]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\p{L}\p{N}\s@.+:/_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Kenya phone normalizer → digits only, coerces to 2547XXXXXXXX when possible. */
export function normalizeKePhone(raw?: string | null): string {
  if (!raw) return "";
  let s = raw.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+2547\d{8}$/.test(raw)) s = s.replace(/^(\+?)/, "");
  if (/^7\d{8}$/.test(s)) s = "254" + s; // 7XXXXXXXX → 2547XXXXXXXX
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}

/** Crude email normalizer (lowercase, trims). */
export function normalizeEmail(raw?: string | null): string {
  return (raw || "").trim().toLowerCase();
}

/* ================================================
 * Block/suspect lists (extend as needed)
 * ================================================ */

const BASE_BLOCKLIST = [
  "scam",
  "porn",
  "mpango",
  "xxx",
  "escort",
  "betting",
  "loan shark",
] as const;

const SUSPECT_TERMS = [
  "quick money",
  "work from home",
  "crypto giveaway",
  "forex signals",
  "telegram group",
] as const;

type Term = typeof BASE_BLOCKLIST[number] | typeof SUSPECT_TERMS[number];

/**
 * Build a regex that:
 *  - matches whole words (with word boundaries where possible)
 *  - tolerates simple obfuscations: a/@, i/1/!, o/0, s/$/5, e/3
 */
function buildTermRegex(term: string): RegExp {
  const map: Record<string, string> = {
    a: "[a@]",
    i: "[i1!|]",
    o: "[o0]",
    s: "[s$5]",
    e: "[e3]",
    l: "[l1|]",
    t: "[t7]",
  };
  const escaped = term
    .toLowerCase()
    .split("")
    .map((ch) => {
      if (/[a-z0-9]/.test(ch) && map[ch]) return map[ch];
      // escape regex metachars
      return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("\\s*"); // tolerate light spacing: p 0 r n

  // Word-ish boundaries: allow punctuation around but avoid mid-word hits
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, "iu");
}

/* Precompile */
const BLOCK_RES = BASE_BLOCKLIST.map((t) => [t, buildTermRegex(t)] as const);
const SUSPECT_RES = SUSPECT_TERMS.map((t) => [t, buildTermRegex(t)] as const);

/* ================================================
 * Public APIs
 * ================================================ */

export type ModerationResult = {
  ok: boolean;
  /** Terms that matched the blocklist (strict) */
  blocked: string[];
  /** Terms that matched the suspect list (soft) */
  suspect: string[];
  /** Set to true if content has links/emails/phones (signal only) */
  hasContacts: boolean;
};

/** Detect links, emails, phones (signal only, not a blocker by itself). */
export function detectContacts(text: string) {
  const t = text;
  const link = /\bhttps?:\/\/[^\s]+/i.test(t) || /\b(?:www\.)[^\s]+\.[a-z]{2,}\b/i.test(t);
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(t);
  const phone =
    /\b(?:\+?254|0)?[17]\d{8}\b/.test(t.replace(/\s|[-.]/g, "")) || /\b\d{10,12}\b/.test(t);
  return { hasContacts: link || email || phone, link, email, phone };
}

/**
 * Main moderation check.
 * - Block if any blocklist term matches.
 * - Mark as suspect for soft terms (caller decides what to do).
 */
export function moderateText(text: string): ModerationResult {
  const norm = normalizeForCompare(text);

  const blocked: string[] = [];
  for (const [term, rx] of BLOCK_RES) {
    if (rx.test(norm)) blocked.push(term);
  }

  const suspect: string[] = [];
  for (const [term, rx] of SUSPECT_RES) {
    if (rx.test(norm)) suspect.push(term);
  }

  const { hasContacts } = detectContacts(text);
  return { ok: blocked.length === 0, blocked, suspect, hasContacts };
}

/** Back-compat thin wrapper (returns boolean), prefer `moderateText` for details. */
export function hasBadWords(text: string) {
  return !moderateText(text).ok;
}

/* ================================================
 * Duplicate key helpers
 * ================================================ */

/**
 * Normalize title for duplicate detection:
 * - remove extra spaces/punctuation noise
 * - lowercase, accent-stripped
 */
function normalizeTitleForKey(title: string) {
  return normalizeForCompare(title).replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

/** Cheap stable string hash (djb2). */
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  // force unsigned, hex
  return (h >>> 0).toString(16);
}

/**
 * Safer duplicate fingerprint:
 *  - normalized title
 *  - rounded price (KES) to nearest 10 to reduce tiny variance
 *  - contact normalized (phone/email)
 */
export function isDuplicateKey(title: string, price: number, contact: string) {
  const t = normalizeTitleForKey(title);
  const p = Math.max(0, Math.round(Number(price) / 10) * 10);
  const phone = normalizeKePhone(contact);
  const email = phone ? "" : normalizeEmail(contact);
  const contactKey = phone || email || normalizeForCompare(contact);

  // Use a compact hash so keys remain short even for long titles
  const titleHash = djb2(t);
  return `${titleHash}|${p}|${contactKey}`;
}

/* ================================================
 * Price outlier detection
 * ================================================ */

export type PriceStats = {
  mean: number;
  sd: number;
  median: number;
  mad: number; // median absolute deviation
};

export function computePriceStats(numbers: number[]): PriceStats {
  const xs = numbers.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  const n = xs.length || 1;

  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);

  const median = xs[Math.floor((n - 1) / 2)] ?? 0;
  const abs = xs.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = abs[Math.floor((n - 1) / 2)] ?? 0;

  return { mean, sd, median, mad };
}

/**
 * Classic z-score gate (5σ by default). Good when data ~ normal.
 */
export function priceIsOutlier(price: number, stats: { mean: number; sd: number }, sigma = 5) {
  if (!Number.isFinite(price) || price < 0) return true;
  if (!Number.isFinite(stats.sd) || stats.sd <= 0) return false;
  return price > stats.mean + sigma * stats.sd || price < Math.max(0, stats.mean - sigma * stats.sd);
}

/**
 * Robust outlier test using MAD (median absolute deviation).
 * A common rule is 6×MAD (≈ 4σ for normal data).
 */
export function priceIsOutlierRobust(price: number, stats: { median: number; mad: number }, k = 6) {
  if (!Number.isFinite(price) || price < 0) return true;
  if (!Number.isFinite(stats.mad) || stats.mad <= 0) return false;
  return Math.abs(price - stats.median) > k * stats.mad;
}

/* ================================================
 * Light spam heuristics (opt-in)
 * ================================================ */

export type SpamSignals = {
  hasLink: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  tooRepetitive: boolean;
  tooShort: boolean;
};

/** Cheap heuristics to assist moderation UI (never block solely on these). */
export function spamSignals(text: string): SpamSignals {
  const t = text || "";
  const link = /\bhttps?:\/\/[^\s]+/i.test(t) || /\b(?:www\.)[^\s]+\.[a-z]{2,}\b/i.test(t);
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(t);
  const phone = /\b(?:\+?254|0)?[17]\d{8}\b/.test(t.replace(/\s|[-.]/g, ""));

  // repetition: same token >30% of content
  const words = normalizeForCompare(t).split(/\s+/).filter(Boolean);
  const tooShort = words.length < 3;
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const maxFreq = Math.max(0, ...Object.values(freq));
  const tooRepetitive = words.length > 0 && maxFreq / words.length > 0.3;

  return { hasLink: link, hasEmail: email, hasPhone: phone, tooRepetitive, tooShort };
}
