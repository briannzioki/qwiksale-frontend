/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const preferredRegion = ["lhr1"];
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Product preview";

type Product = {
  id: string;
  name?: string | null;
  price?: number | null;
  currency?: string | null;
  town?: string | null;
  coverImageUrl?: string | null;
};

function appBaseUrl(): string {
  const raw =
    process.env['NEXT_PUBLIC_SITE_URL'] ||
    process.env['NEXT_PUBLIC_APP_URL'] ||
    process.env['APP_ORIGIN'] ||
    process.env['NEXTAUTH_URL'] ||
    (process.env['VERCEL_URL'] ? `https://${process.env['VERCEL_URL']}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

async function getProduct(id: string): Promise<Product | null> {
  const base = appBaseUrl();
  try {
    const res = await fetch(`${base}/api/products/${encodeURIComponent(id)}`, { next: { revalidate: 300 } });
    if (!res?.ok) return null;
    const json = await res.json().catch(() => ({}));
    // tolerate both { product: {...} } and flat object
    return (json?.product as Product) || (json as Product) || null;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: { id: string } }) {
  const { id } = params;
  const p = await getProduct(id);

  const title = (p?.name || "QwikSale").slice(0, 90);
  const currency = (p?.currency || "KES").toUpperCase();
  const price =
    typeof p?.price === "number" && p.price > 0
      ? `${currency} ${Math.round(p.price).toLocaleString("en-KE")}`
      : "";
  const location = p?.town || "";
  const host = appBaseUrl().replace(/^https?:\/\//, "");

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 48,
          background: "linear-gradient(135deg, #161748 0%, #478559 50%, #39a0ca 100%)",
          color: "#fff",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: "#fff", opacity: 0.9 }} />
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.5 }}>QwikSale</div>
        </div>

        {/* Title + meta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: "flex", gap: 16, fontSize: 28, opacity: 0.9 }}>
            {price ? <span>{price}</span> : null}
            {location ? <span>· {location}</span> : null}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 20, opacity: 0.9 }}>Kenya’s trusted marketplace</div>
          <div style={{ fontSize: 20, opacity: 0.9 }}>{host}</div>
        </div>
      </div>
    ),
    size
  );
}
