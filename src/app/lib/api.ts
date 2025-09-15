import { getServerSession } from "next-auth";
import { getRequestLogger } from "@/app/lib/logger";
import type { NextRequest } from "next/server";

/**
 * Build a child logger bound to this request.
 * We normalize all optional values to `null` (not `undefined`)
 * to satisfy exactOptionalPropertyTypes.
 */
export async function getLoggerForRequest(
  req: NextRequest,
  route?: string | null
) {
  const requestId: string | null = req.headers.get("x-request-id");
  const session = await getServerSession(); // assumes your next-auth config is wired up
  const userId: string | null = (session?.user as { id?: string } | undefined)?.id ?? null;

  return getRequestLogger({
    requestId: requestId ?? null,
    userId,
    route: route ?? null,
  });
}

/**
 * Small wrapper to consistently log errors in handlers.
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     return withApiLogging(req, "/api/health", async (log) => {
 *       log.info("healthcheck_requested");
 *       return NextResponse.json({ ok: true });
 *     });
 *   }
 */
export async function withApiLogging<T>(
  req: NextRequest,
  route: string,
  fn: (log: ReturnType<typeof getRequestLogger>) => Promise<T>
): Promise<T> {
  const log = await getLoggerForRequest(req, route);
  try {
    const result = await fn(log);
    return result;
  } catch (err: unknown) {
    const e = err as { message?: string; stack?: string };
    log.error({ err: { message: e?.message, stack: e?.stack } }, "api_handler_error");
    throw err;
  }
}