// src/app/lib/requests.ts

export type RequestKind = "product" | "service";

export type RequestStatus =
  | "ACTIVE"
  | "OPEN"
  | "CLOSED"
  | "EXPIRED"
  | "DRAFT"
  | "HIDDEN"
  | "DELETED";

export type RequestPublic = {
  id: string;
  kind: RequestKind;
  title: string;
  description?: string | null;
  location?: string | null;
  category?: string | null;
  tags?: string[] | null;
  status: string;
  createdAt: string | null;
  expiresAt: string | null;
  boostUntil: string | null;
};

export type RequestAdmin = RequestPublic & {
  ownerId?: string | null;
  contactEnabled?: boolean | null;
  contactMode?: string | null;
};

export function toIso(value: unknown): string | null {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(String(value));
    const t = d.getTime();
    if (!Number.isFinite(t)) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export function isBoosted(boostUntilIso: string | null | undefined, now = new Date()): boolean {
  if (!boostUntilIso) return false;
  const t = new Date(boostUntilIso).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

export function isExpired(expiresAtIso: string | null | undefined, now = new Date()): boolean {
  if (!expiresAtIso) return false;
  const t = new Date(expiresAtIso).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

export function computeExpiresAt(now: Date, daysFromNow: number): Date {
  const days = Math.max(1, Math.min(365, Math.trunc(daysFromNow)));
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function excerpt(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const s = String(text).replace(/\s+/g, " ").trim();
  if (!s) return null;
  const n = Math.max(20, Math.min(1000, Math.trunc(max)));
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function safeString(v: unknown, max = 200): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function safeKind(v: unknown): RequestKind {
  const s = String(v ?? "").toLowerCase();
  return s === "service" ? "service" : "product";
}

function safeStringOrNull(v: unknown, max = 200): string | null {
  const s = safeString(v, max);
  return s ? s : null;
}

function safeTags(v: unknown, maxItems = 10): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const raw of v) {
    const s = safeString(raw, 40).toLowerCase();
    if (!s) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= Math.max(0, Math.min(50, Math.trunc(maxItems)))) break;
  }
  return out.length ? out : null;
}

export function projectPublicRequest(raw: any): RequestPublic {
  const id = safeString(raw?.id, 200);
  const title = safeString(raw?.title ?? raw?.name, 140) || "Untitled";
  const description = raw?.description != null ? String(raw.description) : null;

  return {
    id,
    kind: safeKind(raw?.kind),
    title,
    description: description,
    location: safeStringOrNull(raw?.location, 120),
    category: safeStringOrNull(raw?.category, 80),
    tags: safeTags(raw?.tags, 10),
    status: safeString(raw?.status, 40) || "ACTIVE",
    createdAt: toIso(raw?.createdAt),
    expiresAt: toIso(raw?.expiresAt),
    boostUntil: toIso(raw?.boostUntil),
  };
}

export function projectAdminRequest(raw: any): RequestAdmin {
  const base = projectPublicRequest(raw);
  return {
    ...base,
    ownerId: safeStringOrNull(raw?.ownerId, 200),
    contactEnabled:
      typeof raw?.contactEnabled === "boolean"
        ? raw.contactEnabled
        : raw?.contactEnabled != null
          ? Boolean(raw.contactEnabled)
          : null,
    contactMode: safeStringOrNull(raw?.contactMode, 40),
  };
}

export function orderByForFeed() {
  return [{ boostUntil: "desc" as const }, { createdAt: "desc" as const }];
}

export function orderByForAdminList() {
  return orderByForFeed();
}

export type ApiOk<T> = { ok: true; data: T; status: number; error: null };
export type ApiErr = {
  ok: false;
  data: null;
  status: number;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResult<T> = ApiOk<T> | ApiErr;

export type RequestOptions = {
  timeoutMs?: number;
  noStore?: boolean;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 12_000;

function mergeSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;

  if (typeof (AbortSignal as any).any === "function") {
    try {
      return (AbortSignal as any).any([a, b]);
    } catch {
      return a;
    }
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();

  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }

  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

function safeParseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeError(message: string, code = "REQUEST_FAILED", details?: unknown): ApiErr {
  const msg = safeString(message, 240) || "Request failed";
  return { ok: false, data: null, status: 0, error: { code, message: msg, details } };
}

function withTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), Math.max(200, Math.trunc(timeoutMs)));
  return { controller, cleanup: () => clearTimeout(id) };
}

export async function requestJson<T = unknown>(
  url: string,
  opts: RequestOptions = {},
): Promise<ApiResult<T>> {
  const timeoutMs = Number.isFinite(opts.timeoutMs as any)
    ? Math.max(200, Math.trunc(opts.timeoutMs as number))
    : DEFAULT_TIMEOUT_MS;

  const { controller, cleanup } = withTimeoutSignal(timeoutMs);

  const headers: Record<string, string> = {
    accept: "application/json",
    ...(opts.headers || {}),
  };

  let bodyStr: string | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = headers["content-type"] || "application/json";
    try {
      bodyStr = JSON.stringify(opts.body);
    } catch {
      cleanup();
      return {
        ok: false,
        data: null,
        status: 0,
        error: { code: "INVALID_BODY", message: "Could not serialize request body" },
      };
    }
  }

  const mergedSignal = mergeSignals(opts.signal, controller.signal);

  try {
    const init: RequestInit = {
      method: opts.method || (bodyStr ? "POST" : "GET"),
      headers,
    };

    if (bodyStr !== undefined) init.body = bodyStr;
    if (mergedSignal) init.signal = mergedSignal;
    if (opts.credentials) init.credentials = opts.credentials;
    if (opts.noStore) init.cache = "no-store";

    const res = await fetch(url, init);

    const status = res.status;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const rawText = await res.text().catch(() => "");

    const parsed = safeParseJson(rawText);

    if (res.ok) {
      if (isObject(parsed) && parsed["ok"] === true && "data" in parsed) {
        return { ok: true, data: parsed["data"] as T, status, error: null };
      }
      return { ok: true, data: (parsed as T) ?? (rawText as any), status, error: null };
    }

    let msg = `Request failed (${status})`;
    let code = "HTTP_ERROR";
    let details: unknown = parsed ?? (rawText || null);

    if (isObject(parsed)) {
      const errAny = parsed["error"];
      const messageAny = parsed["message"];
      const errorMessageAny = parsed["errorMessage"];

      if (typeof errAny === "string") msg = safeString(errAny, 240) || msg;
      if (typeof messageAny === "string") msg = safeString(messageAny, 240) || msg;
      if (typeof errorMessageAny === "string") msg = safeString(errorMessageAny, 240) || msg;

      if (isObject(errAny)) {
        const errMsg = errAny["message"];
        const errCode = errAny["code"];
        if (typeof errMsg === "string") msg = safeString(errMsg, 240) || msg;
        if (typeof errCode === "string") code = safeString(errCode, 80) || code;
      }
    } else {
      const rawMsg = safeString(rawText, 240);
      if (rawMsg) msg = rawMsg;
    }

    return {
      ok: false,
      data: null,
      status,
      error: { code, message: msg, details },
    };
  } catch (e: any) {
    const aborted =
      e?.name === "AbortError" || controller.signal.aborted || !!opts.signal?.aborted;

    if (aborted) {
      cleanup();
      return {
        ok: false,
        data: null,
        status: 0,
        error: { code: "TIMEOUT", message: "Request timed out" },
      };
    }

    cleanup();
    return normalizeError(e?.message || "Network error", "NETWORK_ERROR");
  } finally {
    cleanup();
  }
}

export async function getJson<T = unknown>(
  url: string,
  opts: Omit<RequestOptions, "method" | "body"> = {},
): Promise<ApiResult<T>> {
  return requestJson<T>(url, { ...opts, method: "GET" });
}

export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  opts: Omit<RequestOptions, "method" | "body"> = {},
): Promise<ApiResult<T>> {
  return requestJson<T>(url, { ...opts, method: "POST", body });
}
