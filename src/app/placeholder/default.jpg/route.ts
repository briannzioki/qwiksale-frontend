// src/app/placeholder/default.jpg/route.ts
export const runtime = "edge";

/** SVG fallback served at /placeholder/default.jpg */
export async function GET() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#e5e7eb"/>
      <stop offset="1" stop-color="#f3f4f6"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <g fill="#9ca3af">
    <circle cx="400" cy="250" r="80" fill="#d1d5db"/>
    <rect x="210" y="345" width="380" height="130" rx="12" fill="#d1d5db"/>
  </g>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
        font-size="28" fill="#6b7280">No Image</text>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
