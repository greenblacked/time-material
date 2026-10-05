import { useMemo, useState } from "react";
import { isValidZone } from "@/lib/time/zoned";
import { searchableCities, labelFromZone } from "@/lib/time/cities";
import type { Board } from "@/lib/time/board";

type CityDeskProps = { board: Board; detectedZone: string | null; onAdd: (zone: string) => void };

/** Compact chooser; existing locations live on the timeline. */
export function CityDesk({ board, detectedZone, onAdd }: CityDeskProps) {
  const [query, setQuery] = useState("");
  const takenKey = board.places.map((place) => place.zone).join("|");
  const results = useMemo(() => {
    const options = [...new Map(searchableCities().map((city) => [city.zone, city])).values()];
    const zone = query.trim();
    if (zone && isValidZone(zone) && !options.some((city) => city.zone === zone))
      options.unshift({ zone, label: labelFromZone(zone), region: "Timezone" });
    return options
      .filter((city) => !takenKey.split("|").includes(city.zone))
      .filter((city) =>
        `${city.label} ${city.region} ${city.zone}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
      .slice(0, 8);
  }, [query, takenKey]);
  return (
    <details className="relative">
      <summary className="press cursor-pointer rounded-sm px-3 py-2 text-sm">
        Add city or timezone
      </summary>
      <div className="glass-menu panel absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] p-3 shadow-lg">
        <label className="text-sm">
          Search cities or timezones
          <input
            aria-label="Search cities or timezones"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 h-11 w-full rounded-sm border border-line bg-canvas px-2"
          />
        </label>
        {detectedZone && !takenKey.split("|").includes(detectedZone) ? (
          <button
            type="button"
            className="press mt-2 w-full p-2 text-left text-sm"
            onClick={() => onAdd(detectedZone)}
          >
            Add this device’s zone
          </button>
        ) : null}
        <ul className="mt-2">
          {results.map((city) => (
            <li key={city.zone}>
              <button
                type="button"
                disabled={board.places.length >= 8}
                className="press min-h-11 w-full px-2 text-left text-sm disabled:opacity-50"
                onClick={(event) => {
                  onAdd(city.zone);
                  setQuery("");
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                <span className="block">{city.label}</span>
                <span className="text-xs text-mute">{city.zone}</span>
              </button>
            </li>
          ))}
        </ul>
        {results.length === 0 ? <p className="text-sm text-mute">No matching timezone.</p> : null}
        {board.places.length >= 8 ? (
          <p className="text-xs text-mute">Up to eight locations.</p>
        ) : null}
      </div>
    </details>
  );
}
