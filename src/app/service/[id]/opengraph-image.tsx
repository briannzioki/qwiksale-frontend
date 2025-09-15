/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Service preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ServiceOG = {
  id: string;
  name: string;
  image?: string | null;
  gallery?: string[] | null;
  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;
  category?: string | null;
  subcategory?: string | null;
};

function siteUrl() {
  // Must be absolute for Edge fetch
  const base =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

function safeTxt(v?: string | null) {
  return (v || "").toString().slice(0, 140);
}

function suffix(rt?: "hour" | "day" | "fixed" | null) {
  if (rt === "hour") return "/hr";
  if (rt === "day") return "/day";
  return "";
}

async function loadService(id: string): Promise<ServiceOG | null> {
  // Use your existing API so this works on Edge without Prisma
  const url = `${siteUrl()}/api/services/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
    if (!res.ok) return null;
    const j = await res.json();
    // shape minimally to avoid runtime surprises
    return {
      id: String(j?.id || id),
      name: String(j?.name || ""),
      image: j?.image ?? null,
      gallery: Array.isArray(j?.gallery) ? j.gallery : [],
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

export default async function Image({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params?.id || "");
  const s = (id && (await loadService(id))) || null;

  const title = safeTxt(s?.name) || "QwikSale";
  const hero =
    (s?.image ||
      (Array.isArray(s?.gallery) ? s!.gallery![0] : null) ||
      "/placeholder/default.jpg")!.toString();
  const price =
    typeof s?.price === "number" && s.price > 0
      ? `KES ${new Intl.NumberFormat("en-KE").format(s.price)}${suffix(s?.rateType ?? null)}`
      : "Contact for quote";
  const cat = [s?.category, s?.subcategory].filter(Boolean).join(" • ") || "Service";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
        }}
      >
        <img
          src={hero}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            objectFit: "cover",
            width: "100%",
            height: "100%",
            filter: "brightness(0.7)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(22,23,72,.75), rgba(71,133,89,.45))",
          }}
        />
        <div
          style={{
            margin: 64,
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 980,
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: "flex", gap: 24, fontSize: 28 }}>
            <span>{cat}</span>
            <span>{price}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 22, opacity: 0.9 }}>qwiksale.co</div>
        </div>
      </div>
    ),
    size
  );
}
