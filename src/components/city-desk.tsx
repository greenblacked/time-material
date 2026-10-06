import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
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
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button ref={triggerRef} type="button" className="press min-h-11 cursor-pointer rounded-sm px-3 py-2 text-sm">
          Add city or timezone
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
          onInteractOutside={() => { interactedOutside.current = true; }}
          className="glass-menu panel z-[60] flex h-[min(32rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-3 shadow-lg"
        >
        <label className="shrink-0 text-sm">
          Search cities or timezones
          <input
            ref={inputRef}
            aria-label="Search cities or timezones"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOffset(0);
            }}
            className="mt-2 h-11 w-full rounded-sm border border-line bg-canvas px-2"
          />
        </label>
        {detectedZone && !board.places.some((place) => place.zone === detectedZone) ? (
          <button
            type="button"
            disabled={board.places.length >= 8}
            className="press mt-2 min-h-11 shrink-0 p-2 text-left text-sm disabled:opacity-50"
            onClick={() =>
              select(
                {
                  zone: detectedZone,
                  label: labelFromZone(detectedZone),
                  region: "Device timezone",
                },
              )
            }
          >
            Add this device’s zone
          </button>
        ) : null}
        <p aria-live="polite" className="mt-2 shrink-0 text-xs text-mute">
          {loading ? "Searching…" : `${total} matches`}
          {query.trim().length < 2
            ? " · Enter at least two letters to search worldwide cities."
            : ""}
        </p>
        {error ? (
          <p role="alert" className="text-sm">
            City search unavailable.{" "}
            <button
              type="button"
              className="press min-h-11 px-2"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry
            </button>
          </p>
        ) : null}
        <div key={`${query}:${offset}`} className="min-h-0 overflow-y-auto overscroll-contain">
          <ul className="mt-2">
            {results.map((city) => (
              <li key={placeIdentity(city)}>
                <button
                  type="button"
                  disabled={board.places.length >= 8 || !city.zone || !isValidZone(city.zone)}
                  className="press min-h-11 w-full break-words px-2 py-2 text-left text-sm disabled:opacity-50"
                  onClick={() => select(city)}
                >
                  <span className="block">{city.label}</span>
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
                className="press min-h-11 flex-1 px-2 text-sm"
                onClick={() => (setLoading(true), setOffset((value) => Math.max(0, value - PAGE_SIZE)))}
              >
                Previous results
              </button>
            ) : null}
            {offset + PAGE_SIZE < total ? (
              <button
                type="button"
                disabled={loading}
                className="press min-h-11 flex-1 px-2 text-sm"
                onClick={() => (setLoading(true), setOffset((value) => value + PAGE_SIZE))}
              >
                Load more ({total - offset - PAGE_SIZE} remaining)
              </button>
            ) : null}
          </div>
          {!loading && !error && results.length === 0 ? (
            <p className="text-sm text-mute">No matching city or timezone.</p>
          ) : null}
        </div>
        {board.places.length >= 8 ? (
          <p className="shrink-0 text-xs text-mute">Up to eight locations.</p>
        ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
