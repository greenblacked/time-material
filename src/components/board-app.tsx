import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react";
import { useRefetchWhenConnectorReady } from "@/lib/app-data";
import { loadCalendarWindow } from "@/lib/schedule/calendar.functions";
import type { ScheduleResponse } from "@/lib/schedule/types";
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
  type Board,
} from "@/lib/time/board";
import { derive, meetingBrief, meetingIcs } from "@/lib/time/derive";
import { axisMinutes, searchWindow, type Interval, type Place } from "@/lib/time/intersect";
import { addDays, formatDayLabel, partsInZone, dayKey } from "@/lib/time/zoned";
import { CityDesk } from "./city-desk";
import { Inspector } from "./inspector";
import { Loom } from "./loom";
import { Button, IconButton } from "./ui";

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

function PenUnderline() {
  return (
    <svg aria-hidden className="mt-1 h-2 w-36 text-accent" viewBox="0 0 144 8" fill="none">
      <path
        d="M2 5.2C28 2 52 7 78 4.4S120 2.2 142 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BoardApp() {
  const load = useServerFn(loadCalendarWindow);
  const [board, setBoard] = useState<Board>(() => defaultBoard(Date.now()));
  const [now, setNow] = useState<number | null>(null);
  const [detectedZone, setDetectedZone] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [updating, setUpdating] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [background, setBackground] = useState<Background>("quiet");

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
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!board) return;
    writeStorage(STORAGE_KEY, JSON.stringify(board));
    const query = boardToQuery(board);
    if (window.location.search.slice(1) !== query) {
      window.history.replaceState(null, "", `?${query}`);
    }
  }, [board]);

  const axisZone = board?.places[0]?.zone;
  const day = board?.day;

  useEffect(() => {
    if (!axisZone || !day) return;
    let cancelled = false;
    const { from, to } = searchWindow(day, axisZone);
    setUpdating(true);
    load({ data: { timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString() } })
      .then((result) => {
        if (!cancelled) setSchedule(result);
      })
      .catch(() => {
        if (!cancelled) {
          setSchedule({
            status: "unavailable",
            message: "The calendar could not be read.",
            busy: [],
            events: [],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setUpdating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [axisZone, day, attempt, load]);

  const wait = useRefetchWhenConnectorReady(schedule?.status === "pending", () => {
    setAttempt((value) => value + 1);
  });

  const view = useMemo(() => derive(board, schedule), [board, schedule]);

  const update = (next: Board) => {
    setBoard({
      ...next,
      durationMin: clampDuration(next.durationMin),
      cutMinutes: clampCut(next.cutMinutes, clampDuration(next.durationMin)),
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
    const zoneChanged = places[0]?.zone !== board.places[0]?.zone;
    if (!zoneChanged) {
      update({ ...board, places });
      return;
    }
    const zone = places[0]!.zone;
    const nextDay = dayFromInstant(view.cutStartUtc, zone);
    update({
      ...board,
      places,
      day: nextDay,
      cutMinutes: axisMinutes(view.cutStartUtc, zone, nextDay),
    });
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
    <main id="day" className="relative z-10 mx-auto flex max-w-[90rem] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <a className="skip" href="#loom">
        Skip to the day
      </a>
      <header className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl font-medium leading-tight">Time Material</h1>
          <PenUnderline />
          <p className="mt-3 max-w-xl text-sm text-pretty text-mute">
            A working day across cities. The shared hours are marked. Calendar and Zoom show up
            only when they can actually be read.
          </p>
        </div>
        <div className="float-bar flex flex-wrap items-center gap-2 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label="Previous day" onClick={() => update({ ...board, day: addDays(board.day, -1) })}>
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
            <IconButton label="Next day" onClick={() => update({ ...board, day: addDays(board.day, 1) })}>
              <ChevronRight aria-hidden className="size-4" />
            </IconButton>
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
            <Button
              variant="quiet"
              aria-pressed={board.weekdaysOnly}
              onClick={() => update({ ...board, weekdaysOnly: !board.weekdaysOnly })}
            >
              Weekdays
            </Button>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
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
            <IconButton label={theme === "dark" ? "Use light theme" : "Use dark theme"} onClick={toggleTheme}>
              {theme === "dark" ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
            </IconButton>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div id="loom" className="min-w-0">
          <Loom
            board={board}
            view={view}
            schedule={schedule}
            wait={wait}
            now={now}
            onCut={(minutes) => update({ ...board, cutMinutes: minutes })}
          />
        </div>
        <Inspector
          board={board}
          view={view}
          schedule={schedule}
          updating={updating}
          wait={wait}
          onDuration={(minutes) => update({ ...board, durationMin: minutes })}
          onFocus={focusInterval}
          onRefresh={() => setAttempt((value) => value + 1)}
          onCopy={() => void copyBrief()}
          copied={copied}
          onDownload={downloadIcs}
        />
      </div>

      <CityDesk
        board={board}
        detectedZone={detectedZone}
        onChange={setPlaces}
        onAdd={(zone) => {
          if (board.places.some((place) => place.zone === zone) || board.places.length >= 8) return;
          const place = placeForZone(zone);
          if (!place) return;
          setPlaces([...board.places, place]);
        }}
      />
    </main>
  );
}
