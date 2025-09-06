/**
 * Server-only password utilities (bcryptjs).
 * - Supports optional pepper via AUTH_PEPPER
 * - Supports configurable cost (rounds) via BCRYPT_COST
 * - Offers needsRehash() to migrate old hashes forward
 *
 * NOTE: bcryptjs is pure JS (no native bindings) and safe for Node runtimes.
 * Do NOT use in Edge runtimes.
 */
import bcrypt from "bcryptjs";

const DEFAULT_ROUNDS = Math.max(
  4,
  Number.parseInt(process.env["BCRYPT_COST"] || "10", 10) || 10
);

// FIX: correct bracket access; ensure it's always a string
const ENV_PEPPER = (process.env["AUTH_PEPPER"] ?? "").trim();

/** Internal: basic sanity check for the password string. */
function assertPassword(plain: string) {
  if (typeof plain !== "string" || !plain) throw new Error("Password is required");
  if (plain.length < 6) throw new Error("Password must be at least 6 characters");
  // Optional: add more policy checks here (unicode control chars, etc.)
}

/** Internal: add a pepper if provided. */
function withPepper(plain: string, pepper?: string) {
  const p = (pepper ?? ENV_PEPPER).trim();
  return p ? plain + p : plain;
}

/** Check if a string looks like a bcrypt hash. */
export function isBcryptHash(maybe: string): boolean {
  return typeof maybe === "string" && /^\$2[aby]\$\d{2}\$/.test(maybe);
}

/** Extract bcrypt cost (rounds) from a hash. Returns null if unknown. */
export function costFromHash(hash: string): number | null {
  if (!isBcryptHash(hash)) return null;
  const m = /^\$2[aby]\$(\d{2})\$\S{53}$/.exec(hash); // RegExpExecArray | null
  // Narrow explicitly so m[1] is guaranteed a string for TS
  if (!m || m[1] === undefined) return null;
  return Number.parseInt(m[1], 10);
}

/** Determine if a stored hash should be rehashed using the current cost. */
export function needsRehash(hash: string, targetRounds: number = DEFAULT_ROUNDS): boolean {
  const cost = costFromHash(hash);
  return !isBcryptHash(hash) || cost == null || cost < targetRounds;
}

export type HashOptions = {
  rounds?: number;   // bcrypt cost factor (default from env or 10)
  pepper?: string;   // overrides AUTH_PEPPER for this call
};

/**
 * Hash a plain password for storage.
 * Backward compatible: you can call hashPassword(plain) with no options.
 */
export async function hashPassword(plain: string, options?: HashOptions): Promise<string> {
  assertPassword(plain);
  const rounds = Math.max(4, Number(options?.rounds ?? DEFAULT_ROUNDS));
  const salted = await bcrypt.genSalt(rounds);
  const input = withPepper(plain, options?.pepper);
  return bcrypt.hash(input, salted);
}

/**
 * Compare a plain password to a stored bcrypt hash.
 * Backward compatible: verifyPassword(plain, hash) still works.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
  options?: { pepper?: string }
): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    const input = withPepper(plain, options?.pepper);
    // bcrypt.compare is constant-time wrt input length and hash
    return await bcrypt.compare(input, hash);
  } catch {
    return false;
  }
}

/* -------------------------------------------------
 * Example migration flow (in your sign-in handler):
 * -------------------------------------------------
 * const ok = await verifyPassword(password, user.passwordHash);
 * if (!ok) throw new Error("Invalid credentials");
 *
 * if (needsRehash(user.passwordHash)) {
 *   const newHash = await hashPassword(password);
 *   await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
 * }
 */
