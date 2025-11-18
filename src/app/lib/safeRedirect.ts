// src/app/lib/safeRedirect.ts
import { redirect } from "next/navigation";

/**
 * Normalize an href to a relative "pathname?query" string:
 * - Ignores origin and hash
 * - Removes trailing slash (except root)
 * - Sorts query params and drops empty values
 */
export function normalizePathAndQuery(href: string | URL): string {
  const u = href instanceof URL ? href : new URL(String(href), "http://_");
  let pathname = u.pathname || "/";
  if (pathname !== "/") pathname = pathname.replace(/\/+$/, "");

  const entries = Array.from(u.searchParams.entries()).filter(([, v]) => v !== "");
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const qs = new URLSearchParams(entries).toString();
  return `${pathname}${qs ? `?${qs}` : ""}`;
}

export function samePathAndQuery(a: string | URL, b: string | URL): boolean {
  return normalizePathAndQuery(a) === normalizePathAndQuery(b);
}

/**
 * Redirect only if `targetHref` differs semantically from `currentHref`.
 */
export function redirectIfDifferent(targetHref: string | URL, currentHref: string | URL): void {
  const t = normalizePathAndQuery(targetHref);
  const c = normalizePathAndQuery(currentHref);
  if (t === c) return;
  if (t === "/" && c === "/") return; // explicit root guard
  redirect(t); // ✅ call Next's redirect
}

/**
 * Safe convenience helper when you only know the target and (optionally) the current path/search.
 *
 * If `currentPath` is omitted we default to a conservative behavior (no-op unless querystring present),
 * to avoid accidental self-redirect loops. You can override with ALLOW_BLIND_REDIRECTS=1.
 */
export function safeRedirect(to: string | URL, currentPath?: string, currentSearch = ""): void {
  const allowBlind = process.env["ALLOW_BLIND_REDIRECTS"] === "1";

  try {
    const target = normalizePathAndQuery(to);

    if (currentPath != null) {
      const currURL = new URL(`${currentPath}${currentSearch || ""}`, "http://_");
      const current = normalizePathAndQuery(currURL);
      if (target === current) return;
      if (target === "/" && current === "/") return;
      redirect(target); // ✅ call Next's redirect
      return;
    }

    // No currentPath provided — be conservative to avoid loops.
    if (!allowBlind) {
      if (!target.includes("?")) return; // only allow "blind" when there is a querystring
    }

    redirect(target); // ✅ call Next's redirect
  } catch {
    if (!allowBlind) return;
    redirect(String(to)); // ✅ last-resort
  }
}
