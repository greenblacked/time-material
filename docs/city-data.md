# Worldwide city directory

The directory contains every populated-place record (feature class `P`) from the GeoNames all-country export, without a population threshold. This includes cities, towns, villages, and other populated-place entries. It is a source snapshot, not a guarantee that every settlement worldwide has been recorded accurately.

Search uses the recorded name or ASCII transliteration. Results are ranked by exact name and population, then paginated without discarding matches. Places with no recorded timezone remain visible but cannot be selected automatically.

The catalog is distributed as 1,024 compressed shards. Searching fetches only the relevant shard; the initial planner does not download the worldwide dataset. Timezone calculations use the browser's IANA timezone rules rather than fixed UTC offsets.

## Source and license

City and country data: [GeoNames](https://www.geonames.org/), licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Data has been filtered to populated places, reduced to search fields, normalized, and compressed. Source URL, checksum, coverage counts, and shard sizes are recorded in `public/data/cities/manifest.json`.

## Rebuild

Download `allCountries.zip`, `countryInfo.txt`, `timeZones.txt`, and the [IANA timezone archive](https://data.iana.org/time-zones/tzdata-latest.tar.gz) from [the official export](https://download.geonames.org/export/dump/). Keep raw source files under ignored `.agent/runtime/`. Run the generator in Docker:

```sh
docker run --rm -v "$PWD:/workspace" -w /workspace python:3.13-slim python scripts/data/build-cities.py .agent/runtime/allCountries.zip .agent/runtime/countryInfo.txt .agent/runtime/timeZones.txt public/data/cities .agent/runtime/city-shards --tzdata .agent/runtime/tzdata.tar.gz
```

The source archive is intentionally not committed.
