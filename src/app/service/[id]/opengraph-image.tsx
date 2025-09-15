// src/app/service/[id]/opengraph-image.tsx
/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Service preview";

type ServiceOG = {
  id: string;
  name?: string | null;
  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;
  category?: string | null;
  subcategory?: string | null;
};

function appBaseUrl() {
  const envAppUrl =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    (process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : "") ||
    "http://localhost:3000";
  return envAppUrl.replace(/\/+$/, "");
}

function safeTxt(v?: string | null) {
  return (v || "").toString().slice(0, 140);
}

function rateSuffix(rt?: "hour" | "day" | "fixed" | null) {
  if (rt === "hour") return "/hr";
  if (rt === "day") return "/day";
  return "";
}

async function loadService(id: string): Promise<ServiceOG | null> {
  const base = appBaseUrl();
  const url = `${base}/api/services/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res?.ok) return null;
    const j = await res.json().catch(() => ({}));
    return {
      id: String(j?.id ?? id),
      name: j?.name ?? null,
      price: typeof j?.price === "number" ? j.price : null,
      rateType:
        j?.rateType === "hour" || j?.rateType === "day" || j?.rateType === "fixed"
          ? j.rateType
          : null,
      category: j?.category ?? null,
      subcategory: j?.subcategory ?? null,
    };
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (id && (await loadService(id))) || null;

  const title = safeTxt(s?.name) || "QwikSale Service";
  const price =
    typeof s?.price === "number" && s.price > 0
      ? `KES ${new Intl.NumberFormat("en-KE").format(s.price)}${rateSuffix(s?.rateType)}`
      : "Contact for quote";
  const cat = [s?.category, s?.subcategory].filter(Boolean).join(" • ") || "Service";

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
          background: "linear-gradient(135deg, #39a0ca 0%, #478559 50%, #161748 100%)",
          color: "#fff",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        }}
      >
        {/* Brand row */}
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

        {/* Title + meta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: "flex", gap: 16, fontSize: 28, opacity: 0.9 }}>
            <span>{cat}</span>
            <span>· {price}</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 20, opacity: 0.9 }}>Find trusted pros near you</div>
          <div style={{ fontSize: 20, opacity: 0.9 }}>qwiksale.sale</div>
        </div>
      </div>
    ),
    size
  );
}
