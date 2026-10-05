import { cityByZone, labelFromZone } from "./cities.ts";
import {
  axisMinutes,
  utcFromAxisMinutes,
  findOpenings,
  searchWindow,
  type Place,
} from "./intersect.ts";
import { dayMinutes, isValidZone, parseDay, todayInZone, type ClockFormat } from "./zoned.ts";

export type Span = "workday" | "day";

export type Board = {
  places: Place[];
  day: string;
  durationMin: number;
  cutMinutes: number;
  weekdaysOnly: boolean;
  span: Span;
  clockFormat: ClockFormat;
  showTimezone: boolean;
  markWeekends: boolean;
};

export const STORAGE_KEY = "time-material:v1";
export const THEME_KEY = "time-material:theme";
export const BACKGROUND_KEY = "time-material:background";

export function placeForZone(zone: string): Place | null {
  if (!isValidZone(zone)) return null;
  const known = cityByZone(zone);
  return {
    zone,
    label: known?.label ?? labelFromZone(zone),
    workStart: 9 * 60,
    workEnd: 17 * 60,
  };
}

function defaultPlaces(): Place[] {
  return ["Europe/Kyiv", "Europe/London", "America/New_York"]
    .map((zone) => placeForZone(zone))
    .filter((place): place is Place => place !== null);
}

export function clampDuration(value: number): number {
  return Number.isFinite(value) ? Math.min(1440, Math.max(5, Math.round(value / 5) * 5)) : 60;
}

export function snapMinutes(value: number, step = 15): number {
  return Number.isFinite(value) ? Math.round(value / step) * step : 0;
}

export function clampCut(cutMinutes: number, durationMin: number, length = 1440): number {
  const snapped = snapMinutes(cutMinutes, 5);
  const latest = Math.max(0, length - clampDuration(durationMin));
  return Math.min(latest, Math.max(0, snapped));
}

function seatCut(board: Board): Board {
  const zone = board.places[0]?.zone ?? "UTC";
  const window = searchWindow(board.day, zone);
  const openings = findOpenings(
    board.places,
    board.weekdaysOnly,
    window.from,
    window.to,
    [],
    board.durationMin * 60_000,
  );
  const onThisDay = openings.find((interval) => {
    const start = axisMinutes(interval.start, zone, board.day);
    return start >= 0 && start < dayMinutes(board.day, zone);
  });
  if (!onThisDay) return board;
  return {
    ...board,
    cutMinutes: clampCut(
      axisMinutes(onThisDay.start, zone, board.day),
      5,
      dayMinutes(board.day, zone),
    ),
  };
}

export function defaultBoard(now: number): Board {
  const places = defaultPlaces();
  const zone = places[0]?.zone ?? "UTC";
  const draft: Board = {
    places,
    day: todayInZone(zone, now),
    durationMin: 60,
    cutMinutes: 16 * 60,
    weekdaysOnly: true,
    span: "workday",
    clockFormat: "24h",
    showTimezone: true,
    markWeekends: true,
  };
  return seatCut(draft);
}

/** Regional zones become the axis. Plain UTC is left off so the board stays a city comparison. */
export function applyDeviceZone(board: Board, detected: string, now: number): Board {
  if (!detected.includes("/") || detected.startsWith("Etc/") || !isValidZone(detected)) {
    return board;
  }
  if (board.places[0]?.zone === detected) return board;
  const home = board.places.find((place) => place.zone === detected) ?? placeForZone(detected);
  if (!home) return board;
  const places = [home, ...board.places.filter((place) => place.zone !== home.zone)].slice(0, 8);
  return seatCut({ ...board, places, day: todayInZone(home.zone, now) });
}

function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.zone === "string" &&
    isValidZone(record.zone) &&
    typeof record.label === "string" &&
    record.label.trim().length > 0 &&
    record.label.length < 80 &&
    typeof record.workStart === "number" &&
    typeof record.workEnd === "number" &&
    Number.isFinite(record.workStart) &&
    Number.isFinite(record.workEnd) &&
    record.workStart >= 0 &&
    record.workStart < 24 * 60 &&
    record.workEnd >= 0 &&
    record.workEnd <= 24 * 60
  );
}

export function sanitizeBoard(value: unknown, now: number): Board {
  const fallback = defaultBoard(now);
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const places = Array.isArray(record.places) ? record.places.filter(isPlace).slice(0, 8) : [];
  if (places.length === 0) return fallback;
  const unique: Place[] = [];
  for (const place of places) {
    if (unique.some((item) => item.zone === place.zone)) continue;
    unique.push({
      zone: place.zone,
      label: place.label.trim(),
      workStart: Math.round(place.workStart),
      workEnd: Math.round(place.workEnd),
    });
  }
  const day =
    typeof record.day === "string" && parseDay(record.day) !== null
      ? record.day
      : todayInZone(unique[0]!.zone, now);
  const durationMin = clampDuration(
    typeof record.durationMin === "number" ? record.durationMin : 60,
  );
  const cutMinutes = clampCut(
    typeof record.cutMinutes === "number" ? record.cutMinutes : 16 * 60,
    5,
    dayMinutes(day, unique[0]!.zone),
  );
  const span: Span = record.span === "day" ? "day" : "workday";
  return {
    places: unique,
    day,
    durationMin,
    cutMinutes,
    weekdaysOnly: record.weekdaysOnly !== false,
    span,
    clockFormat:
      record.clockFormat === "12h" || record.clockFormat === "mixed" ? record.clockFormat : "24h",
    showTimezone: record.showTimezone !== false,
    markWeekends: record.markWeekends !== false,
  };
}

export function encodePlaces(places: Place[]): string {
  return places.map((place) => `${place.zone},${place.workStart},${place.workEnd}`).join(";");
}

export function boardToQuery(board: Board): string {
  const params = new URLSearchParams();
  params.set("d", board.day);
  params.set("dur", String(board.durationMin));
  params.set("cut", String(board.cutMinutes));
  params.set("span", board.span);
  params.set("week", board.weekdaysOnly ? "1" : "0");
  params.set("p", encodePlaces(board.places));
  params.set("labels", JSON.stringify(board.places.map((place) => place.label)));
  params.set("clock", board.clockFormat);
  params.set("zones", board.showTimezone ? "1" : "0");
  params.set("weekends", board.markWeekends ? "1" : "0");
  return params.toString();
}

export function boardFromQuery(search: string, now: number): Board | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const packed = params.get("p");
  if (!packed) return null;
  let labels: unknown = [];
  try {
    labels = JSON.parse(params.get("labels") ?? "[]");
  } catch {
    /* old or malformed link */
  }
  const places: Place[] = [];
  for (const part of packed.split(";")) {
    const [zone, start, end] = part.split(",");
    if (!zone || !isValidZone(zone)) continue;
    const workStart = Number(start);
    const workEnd = Number(end);
    if (!Number.isFinite(workStart) || !Number.isFinite(workEnd)) continue;
    const base = placeForZone(zone);
    if (!base) continue;
    const custom = Array.isArray(labels) ? labels[places.length] : undefined;
    places.push({
      ...base,
      label:
        typeof custom === "string" && custom.trim() && custom.length < 80 ? custom : base.label,
      workStart,
      workEnd,
    });
    if (places.length >= 8) break;
  }
  if (places.length === 0) return null;
  return sanitizeBoard(
    {
      places,
      day: params.get("d"),
      durationMin: params.has("dur") ? Number(params.get("dur")) : 60,
      cutMinutes: params.has("cut") ? Number(params.get("cut")) : 16 * 60,
      span: params.get("span"),
      weekdaysOnly: params.get("week") !== "0",
      clockFormat: params.get("clock"),
      showTimezone: params.get("zones") !== "0",
      markWeekends: params.get("weekends") !== "0",
    },
    now,
  );
}

export function loadBoard(now: number, search: string, stored: string | null): Board {
  const fromUrl = boardFromQuery(search, now);
  if (fromUrl) return fromUrl;
  if (stored) {
    try {
      return sanitizeBoard(JSON.parse(stored) as unknown, now);
    } catch {
      return defaultBoard(now);
    }
  }
  const board = defaultBoard(now);
  let detected = "UTC";
  try {
    detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    detected = "UTC";
  }
  return applyDeviceZone(board, detected, now);
}

export function viewBounds(span: Span, length = 1440): { startMin: number; endMin: number } {
  if (span === "day") return { startMin: 0, endMin: length };
  return { startMin: 7 * 60, endMin: 20 * 60 };
}

/** Keep the selected UTC instant when changing the first location. */
export function withPlaces(board: Board, places: Place[]): Board {
  if (!places.length) return board;
  const oldZone = board.places[0]?.zone ?? "UTC";
  const instant = utcFromAxisMinutes(board.cutMinutes, oldZone, board.day);
  const zone = places[0]!.zone;
  const day = todayInZone(zone, instant);
  return { ...board, places, day, cutMinutes: axisMinutes(instant, zone, day) };
}

export function selectionRange(
  anchor: number,
  pointer: number,
  length: number,
  step = 15,
): { cutMinutes: number; durationMin: number } {
  const a = Math.max(0, Math.min(length, snapMinutes(anchor, step)));
  const b = Math.max(0, Math.min(length, snapMinutes(pointer, step)));
  const durationMin = Math.min(length, clampDuration(Math.abs(b - a)));
  return { cutMinutes: Math.min(Math.min(a, b), length - durationMin), durationMin };
}

/** Resize one edge without snapping the opposite, fixed UTC edge. */
export function resizeSelection(
  edge: "start" | "end",
  minute: number,
  cut: number,
  duration: number,
  length: number,
  step = 15,
): { cutMinutes: number; durationMin: number } {
  if (edge === "start") {
    const end = cut + duration;
    const start = Math.max(0, Math.min(end - 5, Math.max(end - 1440, snapMinutes(minute, step))));
    return { cutMinutes: start, durationMin: end - start };
  }
  const end = Math.max(
    cut + 5,
    Math.min(Math.max(length, cut + duration), cut + 1440, snapMinutes(minute, step)),
  );
  return { cutMinutes: cut, durationMin: end - cut };
}
