// src/server/auth.ts
import bcrypt from "bcryptjs";

export async function verifyPassword(plain: string, hash: string) {
  // Supports bcrypt hashes only (recommended)
  return bcrypt.compare(plain, hash);
}
