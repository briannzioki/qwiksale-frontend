// src/app/data/ecosystemCopy.ts

export type EcosystemRole = "buyers" | "sellers" | "carriers" | "admins";

export type EcosystemStep = {
  title: string;
  body: string;
};

export type EcosystemNodeKey = "products" | "services" | "requests" | "delivery" | "admin";

export type EcosystemNodeCopy = {
  key: EcosystemNodeKey;
  title: string;
  desc: string;
  metricLabel: string;
};

export const ECOSYSTEM_FLOW_LABEL =
  "Browse → Chat → Pay/Meet Safe → Deliver → Review → Trust score";

export const ECOSYSTEM_CALLOUTS: readonly { n: string; label: string }[] = [
  { n: "01", label: "Create account + profile" },
  { n: "02", label: "Browse listings" },
  { n: "03", label: "Chat to confirm details" },
  { n: "04", label: "Meet safe or request delivery" },
  { n: "05", label: "Carrier accepts + completes" },
  { n: "06", label: "Review after transaction" },
  { n: "07", label: "Report suspicious activity" },
  { n: "08", label: "Admin moderates + enforces" },
] as const;

export const ECOSYSTEM_NODES: readonly EcosystemNodeCopy[] = [
  {
    key: "products",
    title: "Marketplace",
    desc: "Products people can buy/sell.",
    metricLabel: "+1.2k /wk",
  },
  {
    key: "services",
    title: "Services",
    desc: "Jobs and offers near you.",
    metricLabel: "4.8★ avg",
  },
  {
    key: "requests",
    title: "Requests",
    desc: "Buyer needs and gigs.",
    metricLabel: "92% seen",
  },
  {
    key: "delivery",
    title: "Delivery",
    desc: "Carriers near you/store.",
    metricLabel: "6m avg",
  },
  {
    key: "admin",
    title: "Trust & Admin",
    desc: "Moderation + enforcement.",
    metricLabel: "low risk",
  },
] as const;

export const HOW_IT_WORKS_STEPS: Record<EcosystemRole, readonly EcosystemStep[]> = {
  buyers: [
    { title: "Browse products & services", body: "Use search and filters to find what you need." },
    { title: "Message sellers/providers", body: "Ask questions, confirm details, and agree on next steps." },
    { title: "Post a request when needed", body: "If you can’t find it, request it and let providers reach out." },
    { title: "Choose delivery or meet safe", body: "Use carriers near you or a store area, or meet in public." },
    { title: "Review after", body: "Reviews help the community surface reliable profiles." },
  ],
  sellers: [
    { title: "Create a strong profile", body: "Add username, contact info, and store location if applicable." },
    { title: "Post products or services", body: "Clear photos + honest descriptions convert faster." },
    { title: "Respond to requests", body: "Requests are demand signals—reply quickly to win." },
    { title: "Coordinate delivery or pickup", body: "Use carriers or meet safely with clear instructions." },
    { title: "Build your trust", body: "Reviews and consistent behavior improve outcomes over time." },
  ],
  carriers: [
    { title: "Onboard as a carrier", body: "Carrier profile belongs to your user account (not separate auth)." },
    { title: "Set your station", body: "Your default area helps buyers find you faster." },
    { title: "Go online", body: "When you’re available, location sharing keeps your status fresh." },
    { title: "Accept and complete requests", body: "Deliveries move from pending → accepted → completed." },
    { title: "Follow enforcement rules", body: "Bans and suspensions protect trust when rules are broken." },
  ],
  admins: [
    { title: "Moderate listings/requests", body: "Remove harmful content and handle reports quickly." },
    { title: "Enforce suspensions/bans", body: "Apply consistent enforcement to keep the platform safe." },
    { title: "Monitor platform metrics", body: "Track activity, trust signals, and marketplace health." },
    { title: "Support users and carriers", body: "Resolve disputes and help unblock safe usage." },
  ],
} as const;
