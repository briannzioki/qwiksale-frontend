/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { prisma } from "@/app/lib/prisma";

export const runtime = "edge";
export const alt = "Product preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function safeTxt(v?: string | null) {
  return (v || "").toString().slice(0, 140);
}

export default async function Image({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id || "");
  const p = await prisma.product
    .findUnique({
      where: { id },
      select: { name: true, price: true, image: true, gallery: true, brand: true },
    })
    .catch(() => null);

  const title = safeTxt(p?.name) || "QwikSale";
  const brand = safeTxt(p?.brand);
  const hero =
    (p?.image || (p?.gallery || [])[0] || "/placeholder/default.jpg").trim();

  const price =
    typeof p?.price === "number" && p.price > 0
      ? `KES ${new Intl.NumberFormat("en-KE").format(p.price)}`
      : "Contact for price";

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
              "linear-gradient(135deg, rgba(22,23,72,.75), rgba(57,160,202,.45))",
          }}
        />
        <div style={{ margin: 64, color: "white", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: "flex", gap: 24, fontSize: 28 }}>
            {brand ? <span>Brand: {brand}</span> : null}
            <span>{price}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 22, opacity: 0.9 }}>qwiksale.co</div>
        </div>
      </div>
    ),
    size
  );
}
