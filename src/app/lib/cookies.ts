"use client";

/**
 * Lightweight cookie getter with no RegExp or TS narrowing issues.
 * Safely decodes value and returns null when missing.
 */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      const raw = part.slice(prefix.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

export function setCookie(
  name: string,
  value: string,
  opts: { days?: number; path?: string } = {}
) {
  if (typeof document === "undefined") return;
  const days = opts.days ?? 365;
  const path = opts.path ?? "/";
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
    value
  )}; expires=${d.toUTCString()}; path=${path}; samesite=lax`;
}
