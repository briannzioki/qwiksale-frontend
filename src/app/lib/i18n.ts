// src/app/lib/i18n.ts
export type Locale = "en" | "sw";

type Dict = Record<string, string>;

const en: Dict = {
  copy_link: "Copy link",
  featured: "Featured",
  verified_seller: "Verified Seller",
  verified_provider: "Verified Provider",
  reveal_whatsapp: "Reveal WhatsApp",
  contact_on_whatsapp: "Contact on WhatsApp",
  loading: "Loading…",
  not_found_product: "Product not found.",
  not_found_service: "Service not found.",
  price_contact: "Contact for price",
  quote_contact: "Contact for quote",
  message_seller: "Message Seller",
  message_provider: "Message Provider",
  visit_store: "Visit Store",
  safety_notice_product: "Safety: meet in public places, inspect items carefully, and never share sensitive information.",
  safety_notice_service: "Safety: meet in public places, verify credentials, and never share sensitive information.",
};

const sw: Dict = {
  copy_link: "Nakili kiungo",
  featured: "Kilichoangaziwa",
  verified_seller: "Muuzaji Aliyedhibitishwa",
  verified_provider: "Mtoa Huduma Aliyedhibitishwa",
  reveal_whatsapp: "Onyesha WhatsApp",
  contact_on_whatsapp: "Wasiliana WhatsApp",
  loading: "Inapakia…",
  not_found_product: "Bidhaa haijapatikana.",
  not_found_service: "Huduma haijapatikana.",
  price_contact: "Wasiliana kwa bei",
  quote_contact: "Wasiliana kwa makadirio",
  message_seller: "Tuma Ujumbe kwa Muuzaji",
  message_provider: "Tuma Ujumbe kwa Mtoa Huduma",
  visit_store: "Tembelea Duka",
  safety_notice_product: "Usalama: kutana maeneo ya wazi, kagua bidhaa, na usishiriki taarifa nyeti.",
  safety_notice_service: "Usalama: kutana maeneo ya wazi, hakiki stakabadhi, na usishiriki taarifa nyeti.",
};

const MAP: Record<Locale, Dict> = { en, sw };

/** Get active locale (very small helper). */
export function getLocale(headers?: Headers): Locale {
  const env = (process.env["NEXT_PUBLIC_DEFAULT_LOCALE"] || "en").toLowerCase();
  if (env === "sw") return "sw";
  try {
    const h = headers?.get("accept-language") || "";
    if (/^sw/i.test(h)) return "sw";
  } catch {}
  return "en";
}

export function t(key: keyof typeof en, locale: Locale = "en") {
  return (MAP[locale] || en)[key] || en[key];
}
