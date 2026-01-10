import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const statePath = path.join(__dirname, "..", ".auth", "state.json");

// Write __Secure cookie for qwiksale.sale
setup("write auth storage", async ({ browser }) => {
  const token = process.env.E2E_SESSION_TOKEN!;
  const context = await browser.newContext({
    storageState: {
      cookies: [{
        name: "__Secure-next-auth.session-token",
        value: token,
        domain: "qwiksale.sale",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        expires: Date.now()/1000 + 3600 // 1h
      }],
      origins: []
    },
  });
  await context.storageState({ path: statePath });
  await context.close();
  console.log(`Auth storageState written to ${statePath}`);
});
