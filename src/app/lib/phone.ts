// src/app/lib/phone.ts
export function normalizeKenyanPhone(input: string): string | null {
  if (!input) return null;
  let s = String(input).replace(/\D+/g, "");
  if (s.startsWith("07") && s.length === 10) s = "254" + s.slice(1);
  if (s.startsWith("2547") && s.length === 12) return s;
  if (s.startsWith("25401")) return null; // landlines not supported
  if (s.startsWith("1")) return null;
  return null;
}
