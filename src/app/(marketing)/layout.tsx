// Server layout for marketing pages – consistent padded container.
// Add slots (e.g., <MarketingNav />) here later if needed.

export const dynamic = "force-static";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page py-8">
      {children}
    </div>
  );
}
