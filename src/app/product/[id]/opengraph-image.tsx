// src/app/product/[id]/opengraph-image.tsx
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
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_ORIGIN"] ||
    process.env["NEXTAUTH_URL"] ||
    (process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

async function getProduct(id: string): Promise<Product | null> {
  const base = appBaseUrl();
  try {
    const res = await fetch(`${base}/api/products/${encodeURIComponent(id)}`, {
      next: { revalidate: 300 },
    });
    if (!res?.ok) return null;
    const json = await res.json().catch(() => ({}));
    return (json?.product as Product) || (json as Product) || null;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: { id: string };
}) {
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
          background:
            "linear-gradient(135deg, rgb(22, 23, 72) 0%, rgb(71, 133, 89) 50%, rgb(57, 160, 202) 100%)",
          color: "white",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: "rgba(255,255,255,0.92)",
            }}
          />
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.5 }}>QwikSale</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>

          <div style={{ display: "flex", gap: 16, fontSize: 28, opacity: 0.92 }}>
            {price ? <span>{price}</span> : null}
            {location ? <span>· {location}</span> : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ fontSize: 20, opacity: 0.92 }}>Kenya’s trusted marketplace</div>
          <div style={{ fontSize: 20, opacity: 0.92 }}>{host}</div>
        </div>
      </div>
    ),
    size,
  );
}
