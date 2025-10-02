import type { FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export default async function globalSetup(_: FullConfig) {
  const token = process.env['E2E_SESSION_TOKEN'];
  const statePath = path.join(__dirname, ".auth", "state.json");
  fs.mkdirSync(path.dirname(statePath), { recursive: true });

  // If no token provided, write empty state so tests still run unauthenticated.
  if (!token) {
    fs.writeFileSync(statePath, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    console.log(`Auth storageState (empty) written to ${statePath}`);
    return;
  }

  // Derive cookie attributes from baseURL
  const base = process.env['PLAYWRIGHT_BASE_URL'] || "http://127.0.0.1:3000";
  const url = new URL(base);
  const domain = url.hostname;
  const secure = url.protocol === "https:";

  const state = {
    cookies: [
      {
        name: "__Secure-next-auth.session-token",
        value: token,
        domain,
        path: "/",
        httpOnly: true,
        secure,
        sameSite: "Lax" as const,
        expires: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
      },
    ],
    origins: [] as unknown[],
  };

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`Auth storageState written to ${statePath}`);
}
