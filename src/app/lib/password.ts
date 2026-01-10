import "server-only";
import bcrypt from "bcryptjs";

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export function isBcryptHash(hash: string): boolean {
  // $2a$, $2b$, $2y$ are common bcrypt prefixes
  return /^\$2[aby]\$\d{2}\$/.test(String(hash || ""));
}

function getBcryptCost(): number {
  const raw = safeTrim(process.env["BCRYPT_COST"]) || "10";
  const n = Number(raw);
  if (!Number.isFinite(n)) return 10;
  // Keep cost reasonable for CI/e2e and production.
  if (n < 8) return 8;
  if (n > 14) return 14;
  return Math.floor(n);
}

export async function hashPassword(plain: string): Promise<string> {
  const pw = safeTrim(plain);
  if (!pw) throw new Error("Password is required.");

  const rounds = getBcryptCost();

  // bcryptjs supports callback style; wrap to promise for consistent async usage.
  return await new Promise<string>((resolve, reject) => {
    bcrypt.genSalt(rounds, (saltErr, salt) => {
      if (saltErr || !salt) {
        reject(saltErr ?? new Error("Failed to generate salt."));
        return;
      }
      bcrypt.hash(pw, salt, (hashErr, hash) => {
        if (hashErr || !hash) {
          reject(hashErr ?? new Error("Failed to hash password."));
          return;
        }
        resolve(hash);
      });
    });
  });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const pw = safeTrim(plain);
  const h = safeTrim(hash);
  if (!pw || !h) return false;
  if (!isBcryptHash(h)) return false;

  return await new Promise<boolean>((resolve) => {
    bcrypt.compare(pw, h, (err, same) => {
      if (err) return resolve(false);
      resolve(Boolean(same));
    });
  });
}
