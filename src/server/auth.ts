// src/server/auth.ts
import bcrypt from "bcryptjs";

/** Hash a plain password for storage. */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 6) throw new Error("Password too short");
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

/** Compare a plain password to a stored hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
