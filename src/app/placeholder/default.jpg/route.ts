// src/app/placeholder/default.jpg/route.ts
export const runtime = "nodejs";

/**
 * 1×1 opaque light-gray PNG (#e5e7eb) served at /placeholder/default.jpg
 * We cache a true ArrayBuffer on globalThis to keep TS happy with BodyInit.
 */
const PLACEHOLDER_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

type G = typeof globalThis & { __QS_PLACEHOLDER_AB__?: ArrayBuffer };

function getArrayBuffer(): ArrayBuffer {
  const g = globalThis as G;
  if (g.__QS_PLACEHOLDER_AB__) return g.__QS_PLACEHOLDER_AB__;
  // Decode base64 → Buffer → slice to a standalone ArrayBuffer
  const buf = Buffer.from(PLACEHOLDER_B64, "base64");
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  g.__QS_PLACEHOLDER_AB__ = ab;
  return ab;
}

const HEADERS: HeadersInit = {
  // Path is .jpg, but content is PNG (fine for placeholders and widely supported)
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=31536000, immutable",
  ETag: `"qs-ph-1x1-gray"`,
};

export async function GET() {
  const ab = getArrayBuffer();
  // ArrayBuffer is valid BodyInit; avoids BlobPart typing issues
  return new Response(ab, { headers: HEADERS });
}

export async function HEAD() {
  return new Response(null, { headers: HEADERS });
}
