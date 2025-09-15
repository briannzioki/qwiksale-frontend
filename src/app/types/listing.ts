// src/app/types/listing.ts
export type ListingType = "product" | "service";

export type BaseListing = {
  id: string;
  type: ListingType;
  name: string;
  description?: string | null;
  image?: string | null;
  gallery?: string[] | null;
  category: string;
  subcategory?: string | null;
  location?: string | null; // generic place field
  featured?: boolean;
  createdAt?: string; // ISO
  // Seller snapshot (safe)
  sellerId?: string | null;
  sellerName?: string | null;
  sellerLocation?: string | null;
  sellerMemberSince?: string | null;
  sellerRating?: number | null;
  sellerSales?: number | null;
  seller?: {
    id?: string;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    subscription?: "FREE" | "GOLD" | "PLATINUM";
  } | null;
};

export type ProductListing = BaseListing & {
  type: "product";
  brand?: string | null;
  condition?: "brand new" | "pre-owned" | string | null;
  price?: number | null; // null => contact for price
  negotiable?: boolean;
};

export type RateType = "hour" | "day" | "fixed";

export type ServiceListing = BaseListing & {
  type: "service";
  rateType?: RateType | null;   // hour/day/fixed
  price?: number | null;        // null => contact for quote
  serviceArea?: string | null;  // e.g. "Nairobi" or "Nairobi County"
  availability?: string | null; // e.g. "Weekdays", "24/7"
};

export type Listing = ProductListing | ServiceListing;

/** Narrow helpers */
export function isProduct(l: Listing): l is ProductListing {
  return l?.type === "product";
}
export function isService(l: Listing): l is ServiceListing {
  return l?.type === "service";
}
