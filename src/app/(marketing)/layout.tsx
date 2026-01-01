// src/app/(marketing)/layout.tsx

// Server layout for marketing pages  consistent padded container.
// Add slots (e.g., <MarketingNav />) here later if needed.

import type React from "react";

export const dynamic = "force-static";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="container-page py-8">{children}</div>;
}
