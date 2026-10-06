import assert from "node:assert/strict";
import { test } from "node:test";
import { cityBucket, matchingCityRows, normalizeCity, type CityRow } from "./world-cities.ts";

test("prefix buckets normalize accents and hash Unicode code points", () => {
  assert.equal(normalizeCity("  São Paulo "), "sao paulo");
  assert.equal(cityBucket("São Paulo"), cityBucket("Sao"));
  assert.equal(cityBucket("😀a"), (0x1f600 * 31 + 97) % 1024);
});
test("city prefix search preserves all matches, ascii aliases, identity and exact-name ranking", () => {
  const rows: CityRow[] = [
    ["1", "Sáo", "Sao", "BR", "", "America/Sao_Paulo", 10],
    ["2", "Sao Paulo", "Sao Paulo", "BR", "", "America/Sao_Paulo", 10000],
    ["3", "東京", "Tokyo", "JP", "", "Asia/Tokyo", 20000],
  ];
  assert.deepEqual(
    matchingCityRows([...rows, rows[0]!], "sao").map((row) => row[0]),
    ["1", "2"],
  );
  assert.equal(matchingCityRows(rows, "tok")[0]?.[1], "東京");
  const many = Array.from({ length: 100 }, (_, index): CityRow => [
    String(index),
    `City ${index}`,
    `City ${index}`,
    "US",
    "",
    "America/New_York",
    index,
  ]);
  assert.equal(matchingCityRows(many, "ci").length, 100);
});

test("paged loader returns every match across bounded pages, reuses the query and retries failures", async () => {
  const originalFetch = globalThis.fetch;
  let shardFetches = 0;
  let failOnce = true;
  const rows = Array.from({ length: 95 }, (_, index): CityRow => [
    String(index + 100),
    `Test ${index}`,
    `Test ${index}`,
    "US",
    "State",
    index === 0 ? "" : "America/New_York",
    index,
  ]);
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("manifest.json"))
      return Response.json({
        count: rows.length,
        buckets: 1024,
        countries: { US: "United States" },
        zones: [],
      });
    shardFetches++;
    if (failOnce) {
      failOnce = false;
      return new Response(null, { status: 503 });
    }
    if (shardFetches > 2) return Response.json(rows);
    const gzip = new Blob([JSON.stringify(rows)])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    return new Response(gzip);
  };
  try {
    const { searchCityPage } = await import("./world-city-engine.ts");
    const request = { query: "test", offset: 0, limit: 40, excluded: [] };
    await assert.rejects(searchCityPage(request));
    const first = await searchCityPage(request);
    const second = await searchCityPage({ ...request, offset: 40 });
    const third = await searchCityPage({ ...request, offset: 80 });
    assert.equal(first.total, 95);
    assert.equal(first.cities.length, 40);
    assert.equal(second.cities.length, 40);
    assert.equal(third.cities.length, 15);
    assert.equal(
      new Set([...first.cities, ...second.cities, ...third.cities].map((city) => city.cityId)).size,
      95,
    );
    assert.equal(third.cities.at(-1)?.zone, "");
    assert.equal(first.cities[0]?.region, "State, United States");
    assert.equal(shardFetches, 2);
    const excluded = await searchCityPage({
      ...request,
      excluded: [`city:${first.cities[0]!.cityId}`],
    });
    assert.equal(excluded.total, 94);
    await searchCityPage({ ...request, query: "ma" });
    await searchCityPage({ ...request, query: "sa" });
    const decoded = await searchCityPage(request);
    assert.equal(decoded.total, 95, "Accept gzip already decoded by the browser");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
