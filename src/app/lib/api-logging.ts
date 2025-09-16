// src/app/lib/api-logging.ts
import type { NextRequest } from "next/server";
import { getRequestLogger } from "@/app/lib/logger";
import { auth } from "@/auth"; // ← use the centralized session helper

/** Shape of the per-request logger function */
export type RequestLog = ReturnType<typeof getRequestLogger>;

/** Build a request-scoped logger (adds requestId, userId, route) */
export async function getLoggerForRequest(
  req: NextRequest,
  route?: string | null
): Promise<RequestLog> {
  const requestId = req.headers.get("x-request-id");
  const session = await auth();
  const userId = ((session?.user as any)?.id ?? null) as string | null;
  return getRequestLogger({
    requestId: requestId ?? null,
    userId,
    route: route ?? null,
  });
}

/** Wrapper to consistently log handler success/failure */
export async function withApiLogging<T>(
  req: NextRequest,
  route: string,
  fn: (log: RequestLog) => Promise<T>
): Promise<T> {
  const log = await getLoggerForRequest(req, route);
  try {
    const result = await fn(log);
    return result;
  } catch (err: any) {
    log.error(
      { err: { message: err?.message, stack: err?.stack } },
      "api_handler_error"
    );
    throw err;
  }
}
