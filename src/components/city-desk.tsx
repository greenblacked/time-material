import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { MapPin, Plus } from "lucide-react";
import { isValidZone } from "@/lib/time/zoned";
import { labelFromZone } from "@/lib/time/cities";
import { searchWorldCities, type WorldCity } from "@/lib/time/world-cities";
import { placeIdentity, type Board } from "@/lib/time/board";

type CityDeskProps = {
  board: Board;
  detectedZone: string | null;
  onAdd: (city: WorldCity) => void;
};
const PAGE_SIZE = 40;

export function CityDesk({ board, detectedZone, onAdd }: CityDeskProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const interactedOutside = useRef(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<WorldCity[]>([]);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [loadedOffset, setLoadedOffset] = useState(-1);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const excluded = board.places.map(placeIdentity).join("|");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(false);
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(false);
      void searchWorldCities(query, offset, PAGE_SIZE, excluded.split("|"), controller.signal)
        .then((page) => {
          if (active) {
            setOptions(page.cities);
            setTotal(page.total);
            setLoadedQuery(query);
            setLoadedOffset(offset);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError(true);
            setLoading(false);
          }
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, retry, offset, excluded, open]);
  const results = useMemo(() => {
    const taken = new Set(board.places.map(placeIdentity));
    const filtered = (loadedQuery === query && loadedOffset === offset ? options : []).filter(
      (city) => !taken.has(placeIdentity(city)),
    );
    const zone = query.trim();
    if (
      zone &&
      isValidZone(zone) &&
      !filtered.some((city) => city.zone === zone) &&
      !taken.has(`zone:${zone}`)
    )
      filtered.unshift({ zone, label: labelFromZone(zone), region: "Timezone" });
    return filtered;
  }, [options, board.places, query, loadedQuery, loadedOffset, offset]);
  const select = (city: WorldCity) => {
    onAdd(city);
    setQuery("");
    setOffset(0);
    setOpen(false);
  };
  const full = board.places.length >= 8;
  const searching = query.trim().length >= 2;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Add city or timezone"
          className={`btn btn-ghost h-full w-full justify-start rounded-none rounded-tl-lg px-3 ${full ? "text-mute" : "text-accent"}`}
        >
          <Plus aria-hidden className="size-4" />
          Add city
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          onOpenAutoFocus={(event) => {
            interactedOutside.current = false;
            event.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!interactedOutside.current) triggerRef.current?.focus({ preventScroll: true });
          }}
          onInteractOutside={() => {
            interactedOutside.current = true;
          }}
          className="menu z-[60] flex h-[min(32rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-2"
        >
          {full ? (
            <p className="mb-2 shrink-0 rounded-md bg-inset px-3 py-2 text-sm">
              Up to 8 cities. Remove one to add another.
            </p>
          ) : null}
          <label className="field-label shrink-0 px-1 pt-1">
            Search cities or timezones
            <input
              ref={inputRef}
              aria-label="Search cities or timezones"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
              className="field mt-1 h-11 w-full"
            />
          </label>
          <p aria-live="polite" className="mt-2 shrink-0 px-1 text-xs text-mute">
            {!searching
              ? "Type at least two letters to search cities worldwide."
              : loading
                ? "Searching…"
                : `${total} ${total === 1 ? "match" : "matches"}`}
          </p>
          {!query.trim() &&
          detectedZone &&
          !board.places.some((place) => place.zone === detectedZone) ? (
            <button
              type="button"
              disabled={full}
              className="menu-item mt-1 min-h-11 shrink-0"
              onClick={() =>
                select({
                  zone: detectedZone,
                  label: labelFromZone(detectedZone),
                  region: "Device timezone",
                })
              }
            >
              <MapPin aria-hidden className="size-4 shrink-0 text-mute" />
              <span>
                Your timezone <span className="text-mute">· {detectedZone}</span>
              </span>
            </button>
          ) : null}
          {error ? (
            <p role="alert" className="px-1 text-sm">
              City search unavailable.{" "}
              <button
                type="button"
                className="btn btn-ghost text-accent"
                onClick={() => setRetry((value) => value + 1)}
              >
                Retry
              </button>
            </p>
          ) : null}
          <div key={`${query}:${offset}`} className="min-h-0 overflow-y-auto overscroll-contain">
            <ul className="mt-1">
              {results.map((city) => (
                <li key={placeIdentity(city)}>
                  <button
                    type="button"
                    disabled={board.places.length >= 8 || !city.zone || !isValidZone(city.zone)}
                    className="menu-item min-h-11 flex-col items-start justify-center gap-0 break-words py-2"
                    onClick={() => select(city)}
                  >
                    <span className="block font-medium">{city.label}</span>
                    <span className="block text-xs text-mute">
                      {city.region} · {city.zone || "No timezone recorded"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex">
              {offset > 0 ? (
                <button
                  type="button"
                  disabled={loading}
                  className="btn btn-ghost min-h-11 flex-1"
                  onClick={() => (
                    setLoading(true),
                    setOffset((value) => Math.max(0, value - PAGE_SIZE))
                  )}
                >
                  Previous results
                </button>
              ) : null}
              {offset + PAGE_SIZE < total ? (
                <button
                  type="button"
                  disabled={loading}
                  className="btn btn-ghost min-h-11 flex-1"
                  onClick={() => (setLoading(true), setOffset((value) => value + PAGE_SIZE))}
                >
                  Load more ({total - offset - PAGE_SIZE} remaining)
                </button>
              ) : null}
            </div>
            {!loading && !error && results.length === 0 ? (
              <p className="px-1 py-2 text-sm text-mute">
                {searching
                  ? `No cities match “${query.trim()}”. Try a city name or an IANA zone like Europe/Paris.`
                  : "Start typing a city name or an IANA zone like Europe/Paris."}
              </p>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
