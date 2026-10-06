import type { CityRow } from "./world-cities.ts";

export function normalizeCity(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
export function cityBucket(value: string, buckets = 1024): number {
  return Array.from(normalizeCity(value))
    .slice(0, 2)
    .reduce((hash, char) => (hash * 31 + char.codePointAt(0)!) % buckets, 0);
}
export function matchingCityRows(rows: CityRow[], query: string): CityRow[] {
  const needle = normalizeCity(query);
  const matches = new Map<string, { row: CityRow; exact: number }>();
  for (const row of rows) {
    const name = normalizeCity(row[1]);
    const ascii = normalizeCity(row[2]);
    if (name.startsWith(needle) || ascii.startsWith(needle))
      matches.set(row[0], { row, exact: Number(name === needle || ascii === needle) });
  }
  return [...matches.values()]
    .sort(
      (a, b) =>
        b.exact - a.exact ||
        b.row[6] - a.row[6] ||
        a.row[1].localeCompare(b.row[1]) ||
        a.row[0].localeCompare(b.row[0]),
    )
    .map(({ row }) => row);
}
