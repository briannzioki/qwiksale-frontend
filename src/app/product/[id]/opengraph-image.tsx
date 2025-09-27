/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const preferredRegion = ["lhr1"]; // London
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

type Product = {
  id: string;
  name?: string | null;
  price?: number | null;
  currency?: string | null;
  town?: string | null;
  coverImageUrl?: string | null;
};

function appBaseUrl() {
  const envAppUrl =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    (process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : "") ||
    "http://localhost:3000";
  return envAppUrl.replace(/\/+$/, "");
}

async function getProduct(id: string): Promise<Product | null> {
  const base = appBaseUrl();
  const res = await fetch(`${base}/api/products/${encodeURIComponent(id)}`, {
    next: { revalidate: 300 },
  }).catch(() => null);
  if (!res || !res.ok) return null;

  const json = await res.json().catch(() => ({}));
  return (json?.product as Product) ?? null;
}

export default async function Image({ params }: { params: { id: string } }) {
  const { id } = params;
  const p = await getProduct(id);

  const title = (p?.name || "QwikSale").slice(0, 90);
  const currency = p?.currency || "KES";
  const price =
    typeof p?.price === "number" ? `${currency} ${Math.round(p.price).toLocaleString("en-KE")}` : "";
  const location = p?.town || "";

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
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: "#fff",
              opacity: 0.9,
            }}
          />
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.5 }}>QwikSale</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: "flex", gap: 16, fontSize: 28, opacity: 0.9 }}>
            {price ? <span>{price}</span> : null}
            {location ? <span>· {location}</span> : null}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 20, opacity: 0.9 }}>Kenya’s trusted marketplace</div>
          <div style={{ fontSize: 20, opacity: 0.9 }}>qwiksale.sale</div>
        </div>
      </div>
    ),
    size
  );
}
