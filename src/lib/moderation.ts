const BLOCKLIST = ["scam", "porn", "mpango"]; // extend with a better list
export function hasBadWords(text: string) {
  const t = text.toLowerCase();
  return BLOCKLIST.some(w => t.includes(w));
}

export function isDuplicateKey(title: string, price: number, contact: string) {
  return `${title.toLowerCase().trim()}|${price}|${contact.toLowerCase().trim()}`;
}

export function priceIsOutlier(price: number, stats: { mean: number; sd: number }) {
  return price > stats.mean + 5 * stats.sd || price < Math.max(0, stats.mean - 5 * stats.sd);
}
