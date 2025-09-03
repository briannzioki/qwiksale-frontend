export type Tier = "BASIC" | "GOLD" | "PLATINUM";

export function effectiveTier(tier: Tier, until?: Date | string | null): Tier {
  if (!until) return tier;
  const exp = typeof until === "string" ? new Date(until) : until;
  if (!exp || Number.isNaN(+exp)) return tier;
  return Date.now() > +exp ? "BASIC" : tier;
}

// Add 30 days to an existing or future date
export function extendByDays(base?: Date | string | null, days = 30): Date {
  const start = base ? new Date(base) : new Date();
  if (base && !Number.isNaN(+start) && +start > Date.now()) {
    // stack on top if still active
    start.setDate(start.getDate() + days);
    return start;
  }
  const out = new Date();
  out.setDate(out.getDate() + days);
  return out;
}
