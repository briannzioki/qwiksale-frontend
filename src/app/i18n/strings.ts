// src/app/i18n/strings.ts

export type Locale = "en-KE";
// add more later: | "sw-KE" | "fr" | ...

type Dict = Record<string, string>;

const enKE: Dict = {
  // Common
  "common.apply": "Apply",
  "common.clear": "Clear",
  "common.reset": "Reset",
  "common.close": "Close",
  "common.loading": "Loading…",
  "common.error.generic": "Something went wrong.",
  "common.error.network": "Network error. Please try again.",
  "common.retry": "Retry",
  "common.verified": "Verified",

  // Search
  "search.title.products": "Search",
  "search.title.services": "Search Services",
  "search.subtitle.products": "Find deals across categories, brands and services.",
  "search.subtitle.services": "Find reliable service providers.",
  "search.results.count": "Showing {shown} of {total} results (page {page} / {pages})",
  "search.empty.title": "No results",
  "search.empty.body.products": "Try different keywords or remove some filters.",
  "search.empty.body.services": "Try different keywords or broaden your filters.",
  "search.filters.type": "Type",
  "search.filters.keywords": "Keywords",
  "search.filters.category": "Category",
  "search.filters.subcategory": "Subcategory",
  "search.filters.brand": "Brand",
  "search.filters.condition": "Condition",
  "search.filters.minPrice": "Min price (KES)",
  "search.filters.maxPrice": "Max price (KES)",
  "search.filters.verifiedOnly": "Verified only",
  "search.sort.label": "Sort",
  "search.sort.top": "Top",
  "search.sort.new": "Newest",
  "search.sort.priceAsc": "Price ↑",
  "search.sort.priceDesc": "Price ↓",
  "search.reset": "Reset search",

  // Product card
  "product.featured": "FEATURED",
  "product.price.onRequest": "Price on request",

  // Service card
  "service.quote.onRequest": "Contact for quote",

  // Modals (sell/service/contact)
  "modal.contact.title": "Contact seller",
  "modal.contact.name": "Your name",
  "modal.contact.message": "Message",
  "modal.contact.send": "Send",
  "modal.sell.title": "Create a listing",
  "modal.service.title": "Create a service",

  // Gallery
  "gallery.prev": "Previous image",
  "gallery.next": "Next image",
  "gallery.close": "Close gallery",

  // Combobox / Searchbox
  "combo.noResults": "No suggestions",
  "combo.results": "{n} suggestions",
  "combo.instructions": "Use up/down to navigate, enter to select, escape to dismiss.",

  // A11y helpers
  "aria.required": "(required)",
};

const TABLE: Record<Locale, Dict> = { "en-KE": enKE };

export function s(locale: Locale = "en-KE") {
  const dict = TABLE[locale] || enKE;

  function t(key: string, params?: Record<string, string | number>) {
    const raw = dict[key] ?? key;
    if (!params) return raw;
    return Object.keys(params).reduce(
      (acc, k) => acc.replace(new RegExp(`{${k}}`, "g"), String(params[k])),
      raw
    );
  }

  return { t, dict };
}
