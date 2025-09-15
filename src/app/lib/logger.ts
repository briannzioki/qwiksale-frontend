// src/app/lib/logger.ts
import pino, { type LoggerOptions, type Bindings } from "pino";

const isProd = process.env.NODE_ENV === "production";
const level = process.env["LOG_LEVEL"] || (isProd ? "info" : "debug");

const base = {
  service: "qwiksale-web",
  env: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
};

// Build options without inserting `undefined` for `transport`
const options: LoggerOptions = {
  level,
  base,
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        },
      }),
};

export const logger = pino(options);

/**
 * Create a per-request child logger with useful bindings.
 * Pass only values you actually have; the object omits missing ones.
 */
export function getRequestLogger(ctx?: {
  requestId?: string | null;
  userId?: string | null;
  route?: string | null;
}) {
  const bindings: Bindings = {
    ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx?.userId ? { userId: ctx.userId } : {}),
    ...(ctx?.route ? { route: ctx.route } : {}),
  };

  return logger.child(bindings);
}
