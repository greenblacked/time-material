import { labelFromZone, searchableCities } from "./cities.ts";
import { canonicalZone } from "./zoned.ts";
import { cityBucket, matchingCityRows, normalizeCity } from "./world-city-search.ts";
import type { CityPage, CityRow, CitySearchRequest, WorldCity } from "./world-cities.ts";
type Manifest = {
  count: number;
  buckets: number;
  countries: Record<string, string>;
  zones: string[];
};
let manifestPromise: Promise<Manifest> | undefined;
const shards = new Map<number, Promise<CityRow[]>>();
const CACHE_SHARDS = 2;
async function manifest(): Promise<Manifest> {
  if (!manifestPromise)
    manifestPromise = fetch("/data/cities/manifest.json", { signal: AbortSignal.timeout(15_000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("City search unavailable.");
        return response.json() as Promise<Manifest>;
      })
      .catch((error: unknown) => {
        manifestPromise = undefined;
        throw error;
      });
  return manifestPromise;
}
async function shard(bucket: number): Promise<CityRow[]> {
  const cached = shards.get(bucket);
  if (cached) {
    shards.delete(bucket);
    shards.set(bucket, cached);
    return cached;
  }
  const pending = fetch(`/data/cities/${String(bucket).padStart(4, "0")}.json.gz`, { signal: AbortSignal.timeout(15_000) })
    .then(async (response) => {
      if (!response.ok || !response.body) throw new Error("City search unavailable.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      // Browsers already decode responses served with Content-Encoding: gzip.
      const text = bytes[0] === 0x1f && bytes[1] === 0x8b
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
        : new TextDecoder().decode(bytes);
      return JSON.parse(text) as CityRow[];
    })
    .catch((error: unknown) => {
      if (shards.get(bucket) === pending) shards.delete(bucket);
      throw error;
    });
  shards.set(bucket, pending);
  while (shards.size > CACHE_SHARDS) shards.delete(shards.keys().next().value!);
  return pending;
}
type Matches = { directory: Manifest; rows: CityRow[]; zones: WorldCity[] };
let lastQuery: { key: string; promise: Promise<Matches> } | undefined;
function matches(query: string): Promise<Matches> {
  const key = normalizeCity(query);
  if (lastQuery?.key === key) return lastQuery.promise;
  const promise = (async () => {
    const directory = await manifest();
    const rows =
      Array.from(key).length >= 2
        ? matchingCityRows(await shard(cityBucket(key, directory.buckets)), key)
        : [];
    const zones = new Map(searchableCities().map((city) => [city.zone, city]));
    for (const listed of directory.zones) {
      // The catalog keeps legacy links such as Europe/Kiev; list each zone once, by its current name.
      const zone = canonicalZone(listed);
      if (!zones.has(zone))
        zones.set(zone, { zone, label: labelFromZone(zone), region: "Timezone" });
    }
    return {
      directory,
      rows,
      zones: [...zones.values()].filter((city) =>
        normalizeCity(`${city.label} ${city.region} ${city.zone}`).includes(key),
      ),
    };
  })().catch((error: unknown) => {
    if (lastQuery?.promise === promise) lastQuery = undefined;
    throw error;
  });
  lastQuery = { key, promise };
  return promise;
}
export async function searchCityPage({
  query,
  offset,
  limit,
  excluded,
}: CitySearchRequest): Promise<CityPage> {
  const { directory, rows, zones } = await matches(query);
  const taken = new Set(excluded);
  const availableRows = rows.filter((row) => !taken.has(`city:${row[0]}`));
  const availableZones = zones.filter((city) => !taken.has(`zone:${city.zone}`));
  const total = availableRows.length + availableZones.length;
  const start = Math.max(0, Math.floor(offset));
  const end = start + Math.max(1, Math.min(40, Math.floor(limit)));
  const cities: WorldCity[] = availableRows
    .slice(start, end)
    .map(([cityId, label, , country, admin, zone]) => ({
      cityId,
      label,
      zone,
      region: [admin, directory.countries[country] ?? country].filter(Boolean).join(", "),
    }));
  if (end > availableRows.length)
    cities.push(
      ...availableZones.slice(
        Math.max(0, start - availableRows.length),
        end - availableRows.length,
      ),
    );
  return { cities, total };
}
