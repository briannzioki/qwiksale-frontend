"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
          <h1>Something went wrong</h1>
          {process.env.NODE_ENV !== "production" && (
            <pre style={{ whiteSpace: "pre-wrap" }}>{String(error?.message ?? "")}</pre>
          )}
          <button onClick={() => reset()} aria-label="Try again">Try again</button>
        </div>
      </body>
    </html>
  );
}
