"""Build a local, population-unfiltered populated-place search catalog."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import unicodedata
import zipfile
import tarfile


def normalized(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value)
                   if not unicodedata.category(c).startswith("M")).lower().strip()


def bucket(value):
    result = 0
    for character in normalized(value)[:2]:
        result = (result * 31 + ord(character)) % 1024
    return result


def build(archive, countries_file, zones_file, output, temporary, tzdata=None):
    output.mkdir(parents=True, exist_ok=True)
    temporary.mkdir(parents=True, exist_ok=True)
    countries = {}
    for line in countries_file.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        columns = line.split("\t")
        countries[columns[0]] = columns[4]
    zones = sorted({line.split("\t")[1] for line in zones_file.read_text().splitlines()[1:]
                    if "\t" in line})
    streams = [open(temporary / f"{index:04}.ndjson", "w", encoding="utf-8")
               for index in range(1024)]
    count = missing = 0
    try:
        with zipfile.ZipFile(archive) as zipped:
            with io.TextIOWrapper(zipped.open("allCountries.txt"), encoding="utf-8") as source:
                for line in source:
                    fields = line.rstrip("\n").split("\t")
                    if len(fields) < 19 or fields[6] != "P":
                        continue
                    row = [fields[0], fields[1], fields[2], fields[8], fields[10],
                           fields[17], int(fields[14] or 0)]
                    count += 1
                    missing += not bool(fields[17])
                    encoded = json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
                    for index in {bucket(fields[1]), bucket(fields[2])}:
                        streams[index].write(encoded)
    finally:
        for stream in streams:
            stream.close()
    sizes = []
    for index in range(1024):
        path = temporary / f"{index:04}.ndjson"
        target = output / f"{index:04}.json.gz"
        with gzip.GzipFile(filename="", mode="wb", fileobj=target.open("wb"), mtime=0) as compressed:
            compressed.write(b"[")
            first = True
            with path.open("rb") as rows:
                for row in rows:
                    if not first:
                        compressed.write(b",")
                    compressed.write(row.rstrip(b"\n"))
                    first = False
            compressed.write(b"]")
        sizes.append(target.stat().st_size)
        if sizes[-1] >= 25 * 1024 * 1024:
            raise ValueError("Catalog shard exceeds the Worker asset size limit")
    digest = hashlib.file_digest(archive.open("rb"), "sha256").hexdigest()
    manifest = {"count": count, "missingTimezones": missing, "buckets": 1024,
                "countries": countries, "zones": sorted(set(zones + ["UTC"])),
                "source": "https://download.geonames.org/export/dump/allCountries.zip",
                "license": "CC-BY-4.0", "sourceSha256": digest,
                "compressedBytes": sum(sizes), "maxShardBytes": max(sizes)}
    if tzdata:
        with tarfile.open(tzdata) as database:
            identifiers = set(manifest["zones"])
            for name in ["africa", "antarctica", "asia", "australasia", "europe",
                         "northamerica", "southamerica", "etcetera", "backward"]:
                for line in database.extractfile(name).read().decode().splitlines():
                    fields = line.split()
                    if fields and fields[0] == "Zone":
                        identifiers.add(fields[1])
                    elif fields and fields[0] == "Link":
                        identifiers.add(fields[2])
            manifest["zones"] = sorted(identifiers)
            manifest["tzdbVersion"] = database.extractfile("version").read().decode().strip()
            manifest["timezoneSource"] = "https://data.iana.org/time-zones/tzdata-latest.tar.gz"
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: manifest[key] for key in ["count", "missingTimezones", "compressedBytes", "maxShardBytes"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("countries", type=Path)
    parser.add_argument("zones", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("temporary", type=Path)
    parser.add_argument("--tzdata", type=Path)
    args = parser.parse_args()
    build(args.archive, args.countries, args.zones, args.output, args.temporary, args.tzdata)
