// src/app/global-error.tsx
"use client";

import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  // Report client render errors
  try {
    Sentry.captureException(error);
  } catch {}

  return (
    <html>
      <body>
        <div style={{ padding: 24 }}>
          <h1 style={{ fontWeight: 700, fontSize: 18 }}>Something went wrong</h1>
          <p>We’ve been notified and are looking into it.</p>
        </div>
      </body>
    </html>
  );
}
