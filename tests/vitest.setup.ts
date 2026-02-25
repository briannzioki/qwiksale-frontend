// tests/vitest.setup.ts
import { config } from "dotenv";
import { vi } from "vitest";
import React from "react";
import "@testing-library/jest-dom/vitest";

/**
 * DO NOT load .env.local in tests.
 * It usually contains real service URLs (Upstash, prod-ish APIs) and makes tests hit the network.
 *
 * Priority:
 *   .env.test.local > .env.test > .env
 */
config({ path: ".env.test.local", quiet: true });
config({ path: ".env.test", quiet: true });
config({ path: ".env", quiet: true });

const env = process.env as Record<string, string | undefined>;

function setDefault(key: string, value: string) {
  const cur = env[key];
  if (typeof cur !== "string" || cur.trim() === "") env[key] = value;
}

setDefault("NODE_ENV", "test");
setDefault("NEXTAUTH_SECRET", "test-secret");
setDefault("NEXTAUTH_URL", "http://localhost:3000");
setDefault("AUTH_SECRET", env["NEXTAUTH_SECRET"] ?? "test-secret");
setDefault("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

// Prisma fallback (only prevents import-time crash; doesn’t guarantee DB exists)
setDefault(
  "DATABASE_URL",
  "postgresql://postgres:postgres@localhost:5432/qwiksale_test?schema=public",
);

/* ---------------------- STK / M-Pesa (Daraja) fallbacks ---------------------- */
setDefault("MPESA_ENV", "sandbox");
setDefault("MPESA_CONSUMER_KEY", "test-mpesa-consumer-key");
setDefault("MPESA_CONSUMER_SECRET", "test-mpesa-consumer-secret");

// Canonical shortcode name used by env.ts:
setDefault("MPESA_SHORT_CODE", "174379");

// Back-compat aliases (some older code/tests used these):
setDefault("MPESA_SHORTCODE", env["MPESA_SHORT_CODE"] ?? "174379");
setDefault("MPESA_PAYBILL_SHORTCODE", env["MPESA_SHORT_CODE"] ?? "174379");

// Only needed if any test hits mode=till
setDefault("MPESA_TILL_NUMBER", "3193615");

setDefault("MPESA_PASSKEY", "test-mpesa-passkey");

// Prefer canonical callback route in tests (legacy still supported)
setDefault("MPESA_CALLBACK_URL", "http://localhost:3000/api/pay/mpesa/callback");

// Legacy Daraja env aliases (kept for older code paths if any still reference them)
setDefault("DARAJA_ENV", env["MPESA_ENV"] ?? "sandbox");
setDefault("DARAJA_CONSUMER_KEY", env["MPESA_CONSUMER_KEY"] ?? "test-mpesa-consumer-key");
setDefault("DARAJA_CONSUMER_SECRET", env["MPESA_CONSUMER_SECRET"] ?? "test-mpesa-consumer-secret");
setDefault("DARAJA_SHORTCODE", env["MPESA_SHORT_CODE"] ?? env["MPESA_SHORTCODE"] ?? "174379");
setDefault("DARAJA_PASSKEY", env["MPESA_PASSKEY"] ?? "test-mpesa-passkey");
setDefault("DARAJA_CALLBACK_URL", env["MPESA_CALLBACK_URL"] ?? "http://localhost:3000/api/pay/mpesa/callback");

/* --------------------------- Next.js testing mocks --------------------------- */
/**
 * Make next/image predictable in unit tests:
 * - forward placeholder + blurDataURL as real attributes so your tests can assert them
 * - keep src as the provided string (no absolute URL rewriting)
 */
vi.mock("next/image", () => {
  return {
    __esModule: true,
    default: (props: any) => {
      const {
        src,
        alt,
        width,
        height,
        fill,
        placeholder,
        blurDataURL,
        fetchPriority,
        ...rest
      } = props;

      const resolvedSrc =
        typeof src === "string" ? src : (src?.src as string | undefined) ?? "";

      return React.createElement("img", {
        src: resolvedSrc,
        alt: alt ?? "",
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(fill ? { "data-fill": "true" } : {}), // avoid boolean DOM attribute warnings
        ...(placeholder ? { placeholder } : {}),
        ...(blurDataURL ? { blurdataurl: blurDataURL } : {}),
        ...(fetchPriority ? { fetchpriority: fetchPriority } : {}),
        ...rest,
      });
    },
  };
});