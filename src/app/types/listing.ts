// src/app/types/listing.ts
export type ListingType = "product" | "service";

export type BaseListing = {
  id: string;
  type: ListingType;
  name: string;
  description?: string | null;
  image?: string | null;
  gallery?: string[] | null;
  /** Can be null in your data, so keep it optional+nullable */
  category?: string | null;
  subcategory?: string | null;
  location?: string | null; // generic place field
  featured?: boolean;
  createdAt?: string | null; // ISO
  // Seller snapshot (safe)
  sellerId?: string | null;
  sellerName?: string | null;
  /** Prefer username for profile/store routes; fallback to `u-<id>` when missing */
  sellerUsername?: string | null;
  sellerLocation?: string | null;
  sellerMemberSince?: string | null;
  sellerRating?: number | null;
  sellerSales?: number | null;
  seller?: {
    id?: string;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    /** Match actual values seen in DB ("BASIC", "GOLD"). Keep others for forward-compat. */
    subscription?: "BASIC" | "FREE" | "GOLD" | "PLATINUM" | null;
  } | null;
};

export type ProductListing = BaseListing & {
  type: "product";
  brand?: string | null;
  condition?: "brand new" | "pre-owned" | string | null;
  /** null => contact for price */
  price?: number | null;
  negotiable?: boolean | null;
};

export type RateType = "hour" | "day" | "fixed";

export type ServiceListing = BaseListing & {
  type: "service";
  rateType?: RateType | null;   // hour/day/fixed
  /** null => contact for quote */
  price?: number | null;
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
