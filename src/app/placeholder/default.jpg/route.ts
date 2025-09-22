// src/app/placeholder/default.jpg/route.ts
export const runtime = "nodejs";

/**
 * 1×1 opaque light-gray PNG (#e5e7eb) served at /placeholder/default.jpg
 * We cache an ArrayBuffer in globalThis to avoid re-decoding.
 */
const PLACEHOLDER_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

type G = typeof globalThis & { __QS_PLACEHOLDER_AB__?: ArrayBuffer };

function getArrayBuffer(): ArrayBuffer {
  const g = globalThis as G;
  if (g.__QS_PLACEHOLDER_AB__) return g.__QS_PLACEHOLDER_AB__;

  // Decode base64 → Uint8Array, then return a sliced ArrayBuffer
  const bin = atob(PLACEHOLDER_B64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i) & 0xff;

  // Slice to produce an ArrayBuffer (not ArrayBufferLike) exactly sized to the view
  const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
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
  // Passing an ArrayBuffer is valid BodyInit in the edge runtime
  return new Response(ab, { headers: HEADERS });
}

export async function HEAD() {
  return new Response(null, { headers: HEADERS });
}
