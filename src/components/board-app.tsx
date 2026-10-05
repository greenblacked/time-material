import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react";
import {
  BACKGROUND_KEY,
  STORAGE_KEY,
  THEME_KEY,
  boardToQuery,
  clampCut,
  clampDuration,
  defaultBoard,
  loadBoard,
  placeForZone,
  withPlaces,
  type Board,
} from "@/lib/time/board";
import { derive, meetingBrief, meetingIcs, googleCalendarUrl } from "@/lib/time/derive";
import { axisMinutes, type Interval, type Place } from "@/lib/time/intersect";
import {
  addDays,
  formatDayLabel,
  partsInZone,
  dayKey,
  dayMinutes,
  parseDay,
} from "@/lib/time/zoned";
import { CityDesk } from "./city-desk";
import { Inspector } from "./inspector";
import { Loom } from "./loom";
import { Button, IconButton } from "./ui";
import { BoardCalendar } from "./board-calendar";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
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

type Background = "quiet" | "glass" | "full";

const BACKGROUNDS: { id: Background; label: string }[] = [
  { id: "quiet", label: "Quiet" },
  { id: "glass", label: "Glass" },
  { id: "full", label: "Full" },
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
  const [background, setBackground] = useState<Background>("quiet");
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
    const savedBackground = readStorage(BACKGROUND_KEY);
    if (savedBackground === "glass" || savedBackground === "full" || savedBackground === "quiet") {
      document.documentElement.setAttribute("data-background", savedBackground);
      setBackground(savedBackground);
    }
    const stamp = Date.now();
    setNow(stamp);
    setDetectedZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
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

  const setPaper = (next: Background) => {
    document.documentElement.setAttribute("data-background", next);
    writeStorage(BACKGROUND_KEY, next);
    setBackground(next);
  };

  const copyBrief = async () => {
    const text = meetingBrief(board, view, schedule);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
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

  return (
    <main
      id="day"
      className="relative z-10 mx-auto flex max-w-[90rem] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8"
    >
      <a className="skip" href="#loom">
        Skip to the day
      </a>
      <header className="brand-header flex items-center gap-4">
        <img src="/clock-icon.png" alt="" width="64" height="64" className="brand-clock shrink-0" />
        <div className="min-w-0">
          <h1 className="text-3xl font-medium leading-tight tracking-tight">Time Material</h1>
          <p className="mt-2 text-sm text-pretty text-mute">
            Find a time that works across cities.
          </p>
        </div>
      </header>
      <div className="float-bar flex flex-wrap items-center gap-2 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton
            label="Previous day"
            onClick={() => update({ ...board, day: addDays(board.day, -1) })}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </IconButton>
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
            label="Next day"
            onClick={() => update({ ...board, day: addDays(board.day, 1) })}
          >
            <ChevronRight aria-hidden className="size-4" />
          </IconButton>
          <BoardCalendar
            value={board.day}
            onChange={(day) => {
              if (!parseDay(day)) return;
              const position = { x: window.scrollX, y: window.scrollY };
              update({ ...board, day });
              requestAnimationFrame(() => window.scrollTo(position.x, position.y));
            }}
          />
          <p className="min-w-36 px-1 text-sm tabular-nums">
            {formatDayLabel(board.day)}
            <span className="block text-xs text-mute">{view.axis.label} date</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="quiet"
            aria-pressed={board.span === "workday"}
            onClick={() => update({ ...board, span: "workday" })}
          >
            Workday
          </Button>
          <Button
            variant="quiet"
            aria-pressed={board.span === "day"}
            onClick={() => update({ ...board, span: "day" })}
          >
            Full day
          </Button>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Dark theme"
          aria-checked={darkTheme}
          onClick={toggleTheme}
          className="theme-switch ml-auto shrink-0"
        >
          <span className="theme-switch-thumb">
            {darkTheme ? (
              <Moon aria-hidden className="size-4" />
            ) : (
              <Sun aria-hidden className="size-4" />
            )}
          </span>
        </button>
        <div
          className="flex w-full min-w-0 gap-1 overflow-x-auto border-t border-line pt-2"
          role="group"
          aria-label="Nearby dates"
        >
          {Array.from({ length: 7 }, (_, index) => addDays(board.day, index - 3)).map((date) => (
            <button
              key={date}
              type="button"
              aria-pressed={date === board.day}
              className={`press min-h-11 min-w-20 flex-1 rounded-sm px-2 text-sm ${date === board.day ? "bg-accent/10 text-accent" : "text-mute"}`}
              onClick={() => update({ ...board, day: date })}
            >
              {formatDayLabel(date).replace(/,? \d{4}$/, "")}
            </button>
          ))}
        </div>
        {groups.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-2 text-xs">
            <span className="text-mute">Your groups</span>
            {groups.map((group) => (
              <Button
                key={group.name}
                variant="quiet"
                onClick={() => {
                  const restored = loadBoard(
                    Date.now(),
                    "",
                    JSON.stringify({ ...board, places: group.places }),
                  );
                  setPlaces(restored.places);
                }}
              >
                {group.name}
              </Button>
            ))}
          </div>
        ) : null}
        <details className="w-full border-t border-line p-2">
          <summary className="cursor-pointer text-sm">Options</summary>
          <div className="glass-menu mt-3 flex flex-wrap items-center gap-4 p-3 text-sm">
            <label>
              Time format{" "}
              <select
                aria-label="Time format"
                className="h-11 bg-canvas px-2"
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
            <label>
              <input
                type="checkbox"
                checked={board.showTimezone}
                onChange={(event) => update({ ...board, showTimezone: event.target.checked })}
              />{" "}
              Show timezones
            </label>
            <label>
              <input
                type="checkbox"
                checked={board.markWeekends}
                onChange={(event) => update({ ...board, markWeekends: event.target.checked })}
              />{" "}
              Mark weekends
            </label>
            <label>
              <input
                type="checkbox"
                checked={board.weekdaysOnly}
                onChange={(event) => update({ ...board, weekdaysOnly: event.target.checked })}
              />{" "}
              Weekday work hours only
            </label>
            <div role="radiogroup" aria-label="Background" className="flex gap-2">
              {BACKGROUNDS.map((item) => (
                <Button
                  key={item.id}
                  variant="quiet"
                  role="radio"
                  aria-checked={background === item.id}
                  onClick={() => setPaper(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <Button
              variant="quiet"
              onClick={() =>
                setPlaces([...board.places].sort((a, b) => a.label.localeCompare(b.label)))
              }
            >
              Sort cities by name
            </Button>
            <label>
              Location group{" "}
              <input
                aria-label="Location group name"
                maxLength={60}
                className="h-11 border border-line bg-canvas px-2"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
            </label>
            <Button
              variant="quiet"
              disabled={!groupName.trim()}
              onClick={() => {
                const next = [
                  ...groups.filter((group) => group.name !== groupName.trim()),
                  { name: groupName.trim(), places: board.places },
                ].slice(-20);
                setGroups(next);
                writeStorage("time-material:groups", JSON.stringify(next));
                setGroupName("");
              }}
            >
              Save group
            </Button>
            {groups.map((group) => (
              <span key={group.name}>
                <Button
                  variant="quiet"
                  onClick={() => {
                    const restored = loadBoard(
                      Date.now(),
                      "",
                      JSON.stringify({ ...board, places: group.places }),
                    );
                    setPlaces(restored.places);
                  }}
                >
                  {group.name}
                </Button>
                <button
                  type="button"
                  aria-label={`Delete group ${group.name}`}
                  className="press px-2"
                  onClick={() => {
                    const next = groups.filter((item) => item.name !== group.name);
                    setGroups(next);
                    writeStorage("time-material:groups", JSON.stringify(next));
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </details>
      </div>

      <p className="text-xs text-mute">
        Add cities, choose a date, then drag across the day to select a meeting. Hold Shift for
        five-minute steps.
      </p>
      <div className="flex min-w-0 flex-col gap-4">
        <div id="loom" className="min-w-0">
          <Loom
            board={board}
            view={view}
            now={now}
            onCut={(minutes) => update({ ...board, cutMinutes: minutes })}
            onRange={(cutMinutes, durationMin) => update({ ...board, cutMinutes, durationMin })}
            onPlaces={setPlaces}
            cityChooser={
              <CityDesk
                board={board}
                detectedZone={detectedZone}
                onAdd={(zone) => {
                  const place = placeForZone(zone);
                  if (
                    place &&
                    board.places.length < 8 &&
                    !board.places.some((item) => item.zone === zone)
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
          onDownload={downloadIcs}
          onRange={(cutMinutes, durationMin) => update({ ...board, cutMinutes, durationMin })}
          onLink={() => {
            void navigator.clipboard
              .writeText(
                `${window.location.origin}${window.location.pathname}?${boardToQuery(board)}`,
              )
              .then(() => {
                setLinkCopied(true);
                window.setTimeout(() => setLinkCopied(false), 2000);
              })
              .catch(() => setLinkCopied(false));
          }}
          linkCopied={linkCopied}
          calendarUrl={googleCalendarUrl(board, view, schedule)}
        />
      </div>
    </main>
  );
}
