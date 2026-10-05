import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { CITIES } from "@/lib/time/cities";
import type { Board } from "@/lib/time/board";
import type { Place } from "@/lib/time/intersect";
import { inputToMinutes, minutesToInput } from "@/lib/time/zoned";
import { Button, IconButton } from "./ui";

type CityDeskProps = {
  board: Board;
  detectedZone: string | null;
  onChange: (places: Place[]) => void;
  onAdd: (zone: string) => void;
};

export function CityDesk({ board, detectedZone, onChange, onAdd }: CityDeskProps) {
  const [query, setQuery] = useState("");
  const takenKey = board.places.map((place) => place.zone).join("|");
  const results = useMemo(() => {
    const taken = new Set(takenKey.split("|").filter(Boolean));
    const needle = query.trim().toLowerCase();
    return CITIES.filter((city) => !taken.has(city.zone))
      .filter((city) => {
        if (!needle) return true;
        return (
          city.label.toLowerCase().includes(needle) ||
          city.region.toLowerCase().includes(needle) ||
          city.zone.toLowerCase().includes(needle)
        );
      })
      .slice(0, needle ? 8 : 6);
  }, [query, takenKey]);

  const patch = (zone: string, next: Partial<Place>) => {
    onChange(
      board.places.map((place) => (place.zone === zone ? { ...place, ...next } : place)),
    );
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= board.places.length) return;
    const places = board.places.slice();
    const [item] = places.splice(index, 1);
    if (!item) return;
    places.splice(target, 0, item);
    onChange(places);
  };

  return (
    <section aria-label="Cities" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-medium">Cities</h2>
        <p className="text-sm text-mute">The first city is the axis the day is ruled from.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {board.places.map((place, index) => (
          <li key={place.zone} className="panel p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 px-1 pt-1">
                <p className="truncate text-base font-medium leading-none">{place.label}</p>
                <p className="mt-1 text-xs text-mute">
                  {index === 0 ? "Axis" : place.zone.replaceAll("_", " ")}
                </p>
              </div>
              <div className="flex">
                <IconButton
                  label={`Move ${place.label} earlier`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </IconButton>
                <IconButton
                  label={`Move ${place.label} later`}
                  disabled={index === board.places.length - 1}
                  onClick={() => move(index, 1)}
                  className="ml-1"
                >
                  <ArrowDown aria-hidden className="size-4" />
                </IconButton>
                <IconButton
                  label={`Remove ${place.label}`}
                  disabled={board.places.length < 2}
                  onClick={() => onChange(board.places.filter((item) => item.zone !== place.zone))}
                  className="ml-1"
                >
                  <X aria-hidden className="size-4" />
                </IconButton>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 px-1 text-xs text-mute">
                Work starts
                <input
                  type="time"
                  step={900}
                  value={minutesToInput(place.workStart)}
                  className="h-11 rounded-sm border border-line bg-canvas px-2 text-sm text-ink tabular-nums"
                  onChange={(event) => {
                    const minutes = inputToMinutes(event.target.value);
                    if (minutes !== null) patch(place.zone, { workStart: minutes });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 px-1 text-xs text-mute">
                Work ends
                <input
                  type="time"
                  step={900}
                  value={minutesToInput(place.workEnd === 24 * 60 ? 0 : place.workEnd)}
                  className="h-11 rounded-sm border border-line bg-canvas px-2 text-sm text-ink tabular-nums"
                  onChange={(event) => {
                    const minutes = inputToMinutes(event.target.value);
                    if (minutes !== null) patch(place.zone, { workEnd: minutes === 0 ? 24 * 60 : minutes });
                  }}
                />
              </label>
            </div>
            {place.workEnd <= place.workStart ? (
              <p className="px-1 pt-2 text-xs text-mute">Ends the next morning.</p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="panel p-2">
        <label className="flex flex-col gap-2 px-1" htmlFor="city-search">
          <span className="text-sm">Add a city</span>
          <input
            id="city-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cities"
            className="h-11 rounded-sm border border-line bg-canvas px-3 text-sm text-ink"
            autoComplete="off"
          />
        </label>
        {detectedZone && !takenKey.split("|").includes(detectedZone) ? (
          <Button variant="quiet" className="mt-2" onClick={() => onAdd(detectedZone)}>
            <Plus aria-hidden className="size-4" />
            Add this device’s zone
          </Button>
        ) : null}
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {results.map((city) => (
            <li key={city.zone}>
              <button
                type="button"
                className="press flex h-11 w-full items-center justify-between rounded-sm px-3 text-left text-sm"
                onClick={() => {
                  onAdd(city.zone);
                  setQuery("");
                }}
              >
                <span>{city.label}</span>
                <span className="text-mute">{city.region}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-mute">No matching city.</li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
