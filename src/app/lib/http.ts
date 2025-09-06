/**
 * Minimal, robust HTTP helpers for client & server.
 * - Sends cookies by default (NextAuth-friendly)
 * - Timeouts + aborts
 * - Exponential backoff retries for idempotent requests (GET/HEAD)
 * - Consistent HttpError with status + parsed data/message
 * - Safe JSON parsing (falls back to text)
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export class HttpError<T = unknown> extends Error {
  status: number;
  /** Explicitly allow undefined with exactOptionalPropertyTypes */
  data: T | undefined;
  url: string;

  constructor(message: string, opts: { status: number; data?: T; url: string }) {
    super(message);
    this.name = "HttpError";
    this.status = opts.status;
    this.data = opts.data; // ok because property type includes undefined
    this.url = opts.url;
  }
}

type FetcherOpts = RequestInit & {
  /** Abort/timeout in ms (default 12s) */
  timeoutMs?: number;
  /** Retry attempts for idempotent requests (default 2 extra tries) */
  retries?: number;
  /** Backoff cap in ms (default 8000) */
  backoffCapMs?: number;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;       // GET/HEAD only
const DEFAULT_BACKOFF_CAP = 8_000;

function isIdempotent(method?: string) {
  const m = (method || "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse response body:
 * - If JSON, returns typed T
 * - Else returns text ("" if empty)
 * Never returns undefined/null.
 */
async function parseBody<T = unknown>(res: Response): Promise<T | string> {
  const ctype = res.headers.get("content-type") || "";
  try {
    if (ctype.includes("application/json")) {
      return (await res.json()) as T;
    }
    const text = await res.text();
    return text; // possibly "" for empty body
  } catch {
    return "";
  }
}

/** Core fetcher with timeout, abort, backoff retries for idempotent requests */
export async function http<T = unknown>(
  url: string,
  init: FetcherOpts = {}
): Promise<NonNullable<T>> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    backoffCapMs = DEFAULT_BACKOFF_CAP,
    // Ensure cookies flow for protected endpoints
    credentials = "include",
    cache = "no-store",
    headers,
    ...rest
  } = init;

  // Build headers (keep Accept/JSON default unless overridden)
  const finalHeaders: HeadersInit = {
    Accept: "application/json",
    ...(headers || {}),
  };

  // Create/chain abort
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (rest.signal) {
    const s = rest.signal as AbortSignal;
    if (!s.aborted) {
      s.addEventListener("abort", () => controller.abort(), { once: true });
    } else {
      controller.abort();
    }
  }

  const attemptOnce = async (): Promise<NonNullable<T>> => {
    const res = await fetch(url, {
      ...rest,
      credentials,
      cache,
      headers: finalHeaders,
      signal: controller.signal,
    });

    const data = await parseBody<T>(res); // T | string, never undefined/null

    if (!res.ok) {
      const msg =
        (typeof data === "object" && data && "error" in (data as any) && (data as any).error) ||
        (typeof data === "string" && data) ||
        `HTTP ${res.status}`;
      throw new HttpError<NonNullable<T>>(String(msg), {
        status: res.status,
        data: data as NonNullable<T>,
        url,
      });
    }

    // Ensure we don't return undefined even if caller chose T = undefined | X
    // - If data === "", that's still defined.
    // - Cast to NonNullable<T> to satisfy the contract.
    return data as NonNullable<T>;
  };

  let attempt = 0;
  try {
    return await attemptOnce();
  } catch (err) {
    // Retry only for idempotent requests
    const method = (rest.method || "GET").toUpperCase() as HttpMethod;
    if (!isIdempotent(method)) {
      clearTimeout(timeout);
      throw err;
    }

    while (attempt < retries) {
      attempt += 1;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), backoffCapMs);
      await sleep(delay);
      try {
        return await attemptOnce();
      } catch (e) {
        if (attempt >= retries) {
          clearTimeout(timeout);
          throw e;
        }
      }
    }
    clearTimeout(timeout);
    throw err; // exhaustively
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ */
/* -------------------- Convenience JSON wrappers -------------------- */
/* ------------------------------------------------------------------ */

export async function getJson<T = unknown>(url: string, init: FetcherOpts = {}): Promise<NonNullable<T>> {
  return http<T>(url, { ...init, method: "GET" });
}

export async function delJson<T = unknown>(url: string, init: FetcherOpts = {}): Promise<NonNullable<T>> {
  return http<T>(url, { ...init, method: "DELETE" });
}

export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  init: FetcherOpts = {}
): Promise<NonNullable<T>> {
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  return http<T>(url, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
    retries: 0,
  });
}

export async function putJson<T = unknown>(
  url: string,
  body: unknown,
  init: FetcherOpts = {}
): Promise<NonNullable<T>> {
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  return http<T>(url, {
    ...init,
    method: "PUT",
    headers,
    body: JSON.stringify(body ?? {}),
    retries: 0,
  });
}

export async function patchJson<T = unknown>(
  url: string,
  body: unknown,
  init: FetcherOpts = {}
): Promise<NonNullable<T>> {
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  return http<T>(url, {
    ...init,
    method: "PATCH",
    headers,
    body: JSON.stringify(body ?? {}),
    retries: 0,
  });
}

/* ------------------------------------------------------------------ */
/* ------------------------- Query helpers -------------------------- */
/* ------------------------------------------------------------------ */

export function withQuery(base: string, params?: Record<string, any> | URLSearchParams) {
  if (!params) return base;
  const url = new URL(base, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const usp = params instanceof URLSearchParams ? params : new URLSearchParams();
  if (!(params instanceof URLSearchParams)) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      usp.set(k, String(v));
    }
  }
  url.search = usp.toString();
  return url.toString();
}
