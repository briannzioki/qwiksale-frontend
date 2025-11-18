// src/app/lib/next15.ts
export type SearchParams15 = Record<string, string | string[] | undefined>;

/** Safe getter: returns the first value for a key (or undefined). */
export function getParam(sp: SearchParams15, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}
