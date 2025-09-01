// src/app/placeholder/default.jpg/route.ts
export const runtime = "edge";

/** PNG fallback served at /placeholder/default.jpg (solid light gray) */
export async function GET() {
  // 1x1 opaque light-gray PNG (#e5e7eb). Upscales fine as a neutral placeholder.
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
