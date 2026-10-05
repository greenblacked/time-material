import { cityByZone, labelFromZone } from "./cities.ts";
import {
  axisMinutes,
  findOpenings,
  searchWindow,
  type Place,
} from "./intersect.ts";
import { isValidZone, todayInZone } from "./zoned.ts";

export type Span = "workday" | "day";

export type Board = {
  places: Place[];
  day: string;
  durationMin: number;
  cutMinutes: number;
  weekdaysOnly: boolean;
  span: Span;
};

export const STORAGE_KEY = "time-material:v1";
export const THEME_KEY = "time-material:theme";
export const BACKGROUND_KEY = "time-material:background";

const DURATIONS = [30, 45, 60, 90] as const;

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
  return DURATIONS.includes(value as (typeof DURATIONS)[number]) ? value : 60;
}

export function snapMinutes(value: number): number {
  return Math.round(value / 15) * 15;
}

export function clampCut(cutMinutes: number, durationMin: number): number {
  const snapped = snapMinutes(cutMinutes);
  const latest = 24 * 60 - durationMin;
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
    return start >= 0 && start < 24 * 60;
  });
  if (!onThisDay) return board;
  return {
    ...board,
    cutMinutes: clampCut(axisMinutes(onThisDay.start, zone, board.day), board.durationMin),
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
    record.label.length > 0 &&
    record.label.length < 80 &&
    typeof record.workStart === "number" &&
    typeof record.workEnd === "number" &&
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
  const places = Array.isArray(record.places)
    ? record.places.filter(isPlace).slice(0, 8)
    : [];
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
  const day = typeof record.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.day)
    ? record.day
    : todayInZone(unique[0]!.zone, now);
  const durationMin = clampDuration(
    typeof record.durationMin === "number" ? record.durationMin : 60,
  );
  const cutMinutes = clampCut(
    typeof record.cutMinutes === "number" ? record.cutMinutes : 16 * 60,
    durationMin,
  );
  const span: Span = record.span === "day" ? "day" : "workday";
  return {
    places: unique,
    day,
    durationMin,
    cutMinutes,
    weekdaysOnly: record.weekdaysOnly !== false,
    span,
  };
}

export function encodePlaces(places: Place[]): string {
  return places
    .map((place) => `${place.zone},${place.workStart},${place.workEnd}`)
    .join(";");
}

export function boardToQuery(board: Board): string {
  const params = new URLSearchParams();
  params.set("d", board.day);
  params.set("dur", String(board.durationMin));
  params.set("cut", String(board.cutMinutes));
  params.set("span", board.span);
  params.set("week", board.weekdaysOnly ? "1" : "0");
  params.set("p", encodePlaces(board.places));
  return params.toString();
}

export function boardFromQuery(search: string, now: number): Board | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const packed = params.get("p");
  if (!packed) return null;
  const places: Place[] = [];
  for (const part of packed.split(";")) {
    const [zone, start, end] = part.split(",");
    if (!zone || !isValidZone(zone)) continue;
    const workStart = Number(start);
    const workEnd = Number(end);
    if (!Number.isFinite(workStart) || !Number.isFinite(workEnd)) continue;
    const base = placeForZone(zone);
    if (!base) continue;
    places.push({ ...base, workStart, workEnd });
    if (places.length >= 8) break;
  }
  if (places.length === 0) return null;
  return sanitizeBoard(
    {
      places,
      day: params.get("d"),
      durationMin: Number(params.get("dur")),
      cutMinutes: Number(params.get("cut")),
      span: params.get("span"),
      weekdaysOnly: params.get("week") !== "0",
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

export function viewBounds(span: Span): { startMin: number; endMin: number } {
  if (span === "day") return { startMin: 0, endMin: 24 * 60 };
  return { startMin: 7 * 60, endMin: 20 * 60 };
}
