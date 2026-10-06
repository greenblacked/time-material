import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Moon, SlidersHorizontal, Sun, Trash2 } from "lucide-react";
import {
  LEGACY_BACKGROUND_KEY,
  STORAGE_KEY,
  THEME_KEY,
  boardToQuery,
  clampCut,
  clampDuration,
  defaultBoard,
  loadBoard,
  placeForZone,
  placeIdentity,
  withPlaces,
  type Board,
} from "@/lib/time/board";
import { derive, meetingBrief, meetingIcs, googleCalendarUrl } from "@/lib/time/derive";
import { axisMinutes, type Interval, type Place } from "@/lib/time/intersect";
import {
  addDays,
  canonicalZone,
  formatDayLabel,
  partsInZone,
  dayKey,
  dayMinutes,
  parseDay,
} from "@/lib/time/zoned";
import { CityDesk } from "./city-desk";
import { Inspector } from "./inspector";
import { Loom } from "./loom";
import { Button, IconButton, Segmented } from "./ui";
import { BoardCalendar } from "./board-calendar";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage is optional.
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Some preview panes block storage. The day still works for this visit.
  }
}

function dayFromInstant(utcMs: number, zone: string): string {
  const parts = partsInZone(utcMs, zone);
  return dayKey(parts.year, parts.month, parts.day);
}

/** Close a <details> popover on outside pointer down or Escape, like the Radix popovers. */
function useDetailsDismiss(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const details = ref.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      const details = ref.current;
      if (event.key !== "Escape" || !details?.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref]);
}

const SPANS: { value: Board["span"]; label: string }[] = [
  { value: "workday", label: "Workday" },
  { value: "day", label: "Full day" },
];

export function BoardApp() {
  const navigate = useNavigate();
  const cleanedSharedQuery = useRef(false);
  const [board, setBoard] = useState<Board>(() => defaultBoard(Date.now()));
  const [now, setNow] = useState<number | null>(null);
  const [detectedZone, setDetectedZone] = useState<string | null>(null);
  const [loadedBoard, setLoadedBoard] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [groups, setGroups] = useState<{ name: string; places: Place[] }[]>([]);
  const [groupName, setGroupName] = useState("");
  const schedule = null;
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [copyError, setCopyError] = useState(false);
  const [removed, setRemoved] = useState<{ place: Place; index: number } | null>(null);
  const [toastHeld, setToastHeld] = useState(false);
  const optionsRef = useRef<HTMLDetailsElement>(null);
  useDetailsDismiss(optionsRef);
  const [systemDark, setSystemDark] = useState(false);
  const darkTheme = theme === "dark" || (theme === "system" && systemDark);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const changed = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);

  useEffect(() => {
    const savedTheme = readStorage(THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", savedTheme);
      setTheme(savedTheme);
    }
    // The Background preference (Quiet/Glass/Full) was retired with the flat redesign.
    removeStorage(LEGACY_BACKGROUND_KEY);
    const stamp = Date.now();
    setNow(stamp);
    const reported = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setDetectedZone(reported ? canonicalZone(reported) : null);
    setBoard(loadBoard(stamp, window.location.search, readStorage(STORAGE_KEY)));
    setLoadedBoard(true);
    try {
      const saved = JSON.parse(readStorage("time-material:groups") ?? "[]") as unknown;
      if (Array.isArray(saved))
        setGroups(
          saved
            .filter(
              (item) =>
                item &&
                typeof item.name === "string" &&
                item.name.trim() &&
                item.name.length <= 60 &&
                Array.isArray(item.places),
            )
            .slice(0, 20),
        );
    } catch {
      /* unavailable storage */
    }
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loadedBoard) return;
    writeStorage(STORAGE_KEY, JSON.stringify(board));
  }, [board, loadedBoard]);

  useEffect(() => {
    if (!loadedBoard || cleanedSharedQuery.current) return;
    cleanedSharedQuery.current = true;
    const params = new URLSearchParams(window.location.search);
    const boardKeys = [
      "d",
      "dur",
      "cut",
      "span",
      "week",
      "p",
      "labels",
      "cities",
      "clock",
      "zones",
      "weekends",
    ];
    const hasBoardQuery = boardKeys.some((key) => params.has(key));
    if (!hasBoardQuery) return;
    for (const key of boardKeys) params.delete(key);
    const query = params.toString();
    // The shared board has been loaded; keep unrelated parameters and the anchor.
    void navigate({
      href: `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      replace: true,
      resetScroll: false,
    });
  }, [loadedBoard, navigate]);

  const view = useMemo(() => derive(board, schedule), [board, schedule]);

  const update = (next: Board) => {
    setBoard({
      ...next,
      durationMin: clampDuration(next.durationMin),
      cutMinutes: clampCut(next.cutMinutes, 5, dayMinutes(next.day, next.places[0]?.zone ?? "UTC")),
    });
  };

  const focusInterval = (interval: Interval) => {
    if (!board) return;
    const zone = board.places[0]?.zone ?? "UTC";
    const nextDay = dayFromInstant(interval.start, zone);
    const minutes = axisMinutes(interval.start, zone, nextDay);
    update({ ...board, day: nextDay, cutMinutes: minutes });
  };

  const setPlaces = (places: Place[]) => {
    if (places.length === 0) return;
    update(withPlaces(board, places));
  };

  const toggleTheme = () => {
    const current =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    writeStorage(THEME_KEY, next);
    setTheme(next);
  };

  useEffect(() => {
    if (!copyError) return;
    const timer = window.setTimeout(() => setCopyError(false), 8000);
    return () => window.clearTimeout(timer);
  }, [copyError]);

  // The toast waits while the pointer or focus is on it, so Undo stays reachable (WCAG 2.2.1).
  useEffect(() => {
    if (!removed || toastHeld) return;
    const timer = window.setTimeout(() => setRemoved(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [removed, toastHeld]);

  const removePlace = (place: Place) => {
    if (board.places.length < 2) return;
    const index = board.places.findIndex((item) => placeIdentity(item) === placeIdentity(place));
    setToastHeld(false);
    setRemoved({ place, index });
    setPlaces(board.places.filter((item) => placeIdentity(item) !== placeIdentity(place)));
    // The open menu unmounts with its row; hand focus to the row that took its place.
    requestAnimationFrame(() => {
      const triggers = document.querySelectorAll<HTMLElement>(".city-row-menu > summary");
      triggers[Math.min(Math.max(index, 0), triggers.length - 1)]?.focus();
    });
  };

  /** Put back only the removed city, at its old position, keeping later edits. */
  const undoRemove = () => {
    if (!removed) return;
    setToastHeld(false);
    setRemoved(null);
    const { place, index } = removed;
    if (board.places.length >= 8) return;
    if (board.places.some((item) => placeIdentity(item) === placeIdentity(place))) return;
    const places = [...board.places];
    places.splice(Math.min(Math.max(index, 0), places.length), 0, place);
    setPlaces(places);
  };

  useEffect(() => {
    if (!removed) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z")
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      undoRemove();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const restoreGroup = (places: Place[]) => {
    const restored = loadBoard(Date.now(), "", JSON.stringify({ ...board, places }));
    setPlaces(restored.places);
  };

  const saveGroups = (next: { name: string; places: Place[] }[]) => {
    setGroups(next);
    writeStorage("time-material:groups", JSON.stringify(next));
  };

  const copyBrief = async () => {
    const text = meetingBrief(board, view, schedule);
    try {
      await navigator.clipboard.writeText(text);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };

  const downloadIcs = () => {
    const blob = new Blob([meetingIcs(board, view, schedule)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "time-material.ics";
    link.click();
    URL.revokeObjectURL(url);
  };

  const dayParts = (date: string) => {
    const [weekday = "", rest = ""] = formatDayLabel(date).split(", ");
    return { weekday, day: rest.split(" ")[0] ?? "" };
  };

  return (
    <main id="day" className="safe-x relative z-10 mx-auto flex max-w-[90rem] flex-col gap-4">
      <a className="skip" href="#loom">
        Skip to the day
      </a>
      <header className="flex h-14 items-center gap-3">
        <img src="/clock-icon.png" alt="" width="32" height="32" className="size-8 shrink-0" />
        <h1 className="text-lg font-semibold tracking-tight">Time Material</h1>
        <p className="hidden truncate text-sm text-mute sm:block">
          Find a time that works across cities.
        </p>
      </header>
      <div className="float-bar flex flex-wrap items-center gap-2 p-2">
        <div className="order-1 flex items-center gap-1">
          <Button
            variant="quiet"
            onClick={() => {
              if (now === null) return;
              update({ ...board, day: dayFromInstant(now, view.axis.zone) });
            }}
          >
            Today
          </Button>
          <IconButton
            label="Previous day"
            variant="ghost"
            onClick={() => update({ ...board, day: addDays(board.day, -1) })}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </IconButton>
          <IconButton
            label="Next day"
            variant="ghost"
            onClick={() => update({ ...board, day: addDays(board.day, 1) })}
          >
            <ChevronRight aria-hidden className="size-4" />
          </IconButton>
        </div>
        <div className="order-4 flex min-w-40 flex-1 items-center gap-3 md:order-2 md:flex-none">
          <BoardCalendar
            value={board.day}
            onChange={(day) => {
              if (!parseDay(day)) return;
              const position = { x: window.scrollX, y: window.scrollY };
              update({ ...board, day });
              requestAnimationFrame(() => window.scrollTo(position.x, position.y));
            }}
          />
          <p className="hidden whitespace-nowrap tabular-nums lg:block">
            <span className="block text-sm font-medium">{formatDayLabel(board.day)}</span>
            <span className="block text-xs text-mute">{view.axis.label} date</span>
          </p>
        </div>
        <Segmented
          label="Visible span"
          className="order-5 min-w-40 flex-1 md:order-3 md:flex-none"
          options={SPANS}
          value={board.span}
          onChange={(span) => update({ ...board, span })}
        />
        <div aria-hidden className="order-3 h-0 basis-full md:hidden" />
        <div aria-hidden className="hidden flex-1 md:order-4 md:block" />
        <div className="order-2 ml-auto flex items-center gap-1 md:order-5 md:ml-0">
          <details ref={optionsRef}>
            <summary className="btn btn-ghost" title="Options">
              <SlidersHorizontal aria-hidden className="size-4" />
              <span className="sr-only md:not-sr-only">Options</span>
            </summary>
            <div className="menu absolute right-2 top-full z-50 mt-2 grid max-h-[calc(100svh-8rem)] w-[min(22rem,calc(100%-1rem))] grid-cols-[minmax(0,1fr)] gap-6 overflow-y-auto p-4">
              <section className="grid gap-2" aria-labelledby="options-display">
                <h2 id="options-display" className="eyebrow">
                  Display
                </h2>
                <label className="flex items-center justify-between gap-4">
                  Time format
                  <select
                    aria-label="Time format"
                    className="field"
                    value={board.clockFormat}
                    onChange={(event) =>
                      update({ ...board, clockFormat: event.target.value as Board["clockFormat"] })
                    }
                  >
                    <option value="24h">24 hour</option>
                    <option value="12h">12 hour</option>
                    <option value="mixed">Local format</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={board.showTimezone}
                    onChange={(event) => update({ ...board, showTimezone: event.target.checked })}
                  />
                  Show timezones
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={board.markWeekends}
                    onChange={(event) => update({ ...board, markWeekends: event.target.checked })}
                  />
                  Mark weekends
                </label>
              </section>
              <section className="grid gap-2" aria-labelledby="options-work">
                <h2 id="options-work" className="eyebrow">
                  Work hours
                </h2>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={board.weekdaysOnly}
                    onChange={(event) => update({ ...board, weekdaysOnly: event.target.checked })}
                  />
                  Weekday work hours only
                </label>
              </section>
              <section className="grid gap-2" aria-labelledby="options-cities">
                <h2 id="options-cities" className="eyebrow">
                  City groups
                </h2>
                <Button
                  variant="quiet"
                  className="justify-self-start"
                  onClick={() =>
                    setPlaces([...board.places].sort((a, b) => a.label.localeCompare(b.label)))
                  }
                >
                  Sort cities by name
                </Button>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = groupName.trim();
                    if (!name) return;
                    saveGroups(
                      [
                        ...groups.filter((group) => group.name !== name),
                        { name, places: board.places },
                      ].slice(-20),
                    );
                    setGroupName("");
                  }}
                >
                  <input
                    aria-label="Location group name"
                    placeholder="e.g. Product team"
                    maxLength={60}
                    className="field w-0 min-w-0 flex-1"
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                  />
                  <Button type="submit" variant="quiet" disabled={!groupName.trim()}>
                    Save group
                  </Button>
                </form>
                <p className="text-xs text-mute">
                  Saves the current cities so you can reload them.
                </p>
                {groups.length > 0 ? (
                  <ul className="grid gap-1">
                    {groups.map((group) => (
                      <li key={group.name} className="flex items-center gap-1">
                        <button
                          type="button"
                          className="menu-item min-w-0 flex-1 truncate"
                          onClick={() => restoreGroup(group.places)}
                        >
                          {group.name}
                        </button>
                        <IconButton
                          label={`Delete group ${group.name}`}
                          variant="ghost"
                          className="text-mute"
                          onClick={() =>
                            saveGroups(groups.filter((item) => item.name !== group.name))
                          }
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </div>
          </details>
          <IconButton
            label="Dark theme"
            variant="ghost"
            className="theme-toggle"
            role="switch"
            aria-checked={darkTheme}
            onClick={toggleTheme}
          >
            {darkTheme ? (
              <Moon aria-hidden className="size-4" />
            ) : (
              <Sun aria-hidden className="size-4" />
            )}
          </IconButton>
        </div>
      </div>

      <nav aria-label="Nearby dates" className="seg grid w-full grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => addDays(board.day, index - 3)).map((date) => {
          const parts = dayParts(date);
          return (
            <button
              key={date}
              type="button"
              aria-current={date === board.day ? "date" : undefined}
              aria-label={formatDayLabel(date)}
              className="seg-item h-12 flex-col gap-0 px-1 sm:h-9 sm:flex-row sm:gap-1"
              onClick={() => update({ ...board, day: date })}
            >
              <span className="text-xs sm:text-sm">{parts.weekday}</span>
              <span className="text-sm font-medium">{parts.day}</span>
            </button>
          );
        })}
      </nav>

      {groups.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Your groups">
          <span className="text-xs text-mute">Your groups</span>
          {groups.map((group) => (
            <Button key={group.name} variant="quiet" onClick={() => restoreGroup(group.places)}>
              {group.name}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-4">
        <div id="loom" className="min-w-0">
          <Loom
            board={board}
            view={view}
            now={now}
            onCut={(minutes) => update({ ...board, cutMinutes: minutes })}
            onRange={(cutMinutes, durationMin) => update({ ...board, cutMinutes, durationMin })}
            onPlaces={setPlaces}
            onRemove={removePlace}
            onSpan={(span) => update({ ...board, span })}
            cityChooser={
              <CityDesk
                board={board}
                detectedZone={detectedZone}
                onAdd={(city) => {
                  const base = placeForZone(city.zone);
                  const place = base
                    ? { ...base, label: city.label, region: city.region, cityId: city.cityId }
                    : null;
                  if (
                    place &&
                    board.places.length < 8 &&
                    !board.places.some((item) => placeIdentity(item) === placeIdentity(place))
                  )
                    setPlaces([...board.places, place]);
                }}
              />
            }
          />
        </div>
        <Inspector
          board={board}
          view={view}
          onDuration={(minutes) => update({ ...board, durationMin: minutes })}
          onFocus={focusInterval}
          onCopy={() => void copyBrief()}
          copied={copied}
          copyError={copyError}
          onDownload={downloadIcs}
          onRange={(cutMinutes, durationMin) => update({ ...board, cutMinutes, durationMin })}
          onLink={() => {
            void navigator.clipboard
              .writeText(
                `${window.location.origin}${window.location.pathname}?${boardToQuery(board)}`,
              )
              .then(() => {
                setCopyError(false);
                setLinkCopied(true);
                window.setTimeout(() => setLinkCopied(false), 2000);
              })
              .catch(() => {
                setLinkCopied(false);
                setCopyError(true);
              });
          }}
          linkCopied={linkCopied}
          calendarUrl={googleCalendarUrl(board, view, schedule)}
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {removed ? `${removed.place.label} removed. Press Control or Command Z to undo.` : ""}
      </p>
      {removed ? (
        <div
          onPointerEnter={() => setToastHeld(true)}
          onPointerLeave={() => setToastHeld(false)}
          onFocus={() => setToastHeld(true)}
          onBlur={() => setToastHeld(false)}
          className="menu fixed bottom-4 left-1/2 z-[70] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 py-2 pl-4 pr-2 text-sm"
        >
          <span className="truncate">{removed.place.label} removed</span>
          <Button
            variant="ghost"
            className="text-accent"
            aria-keyshortcuts="Control+Z Meta+Z"
            onClick={undoRemove}
          >
            Undo
          </Button>
        </div>
      ) : null}
    </main>
  );
}
