export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 Sunday … 6 Saturday, in the given zone. */
  weekday: number;
};

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

export function isValidZone(timeZone: string): boolean {
  try {
    formatter(timeZone).format(0);
    return true;
  } catch {
    formatters.delete(timeZone);
    return false;
  }
}

function readParts(utcMs: number, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(new Date(utcMs));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour,
    minute: pick("minute"),
    second: pick("second"),
    weekday: WEEKDAY[weekdayName] ?? 0,
  };
}

export function partsInZone(utcMs: number, timeZone: string): ZonedParts {
  try {
    return readParts(utcMs, timeZone);
  } catch {
    return readParts(utcMs, "UTC");
  }
}

/** Local wall clock minus the UTC instant, in milliseconds. */
export function offsetMs(utcMs: number, timeZone: string): number {
  const parts = partsInZone(utcMs, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - utcMs;
}

/**
 * UTC instant for a wall-clock time in `timeZone`.
 * Iterates because the offset depends on the instant (daylight saving).
 */
export function wallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = wall;
  for (let i = 0; i < 4; i += 1) {
    const next = wall - offsetMs(utc, timeZone);
    if (Math.abs(next - utc) < 1000) return next;
    utc = next;
  }
  return utc;
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function todayInZone(timeZone: string, now: number): string {
  const parts = partsInZone(now, timeZone);
  return dayKey(parts.year, parts.month, parts.day);
}

export function parseDay(day: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  return { year, month, day: date };
}

export function addDays(day: string, amount: number): string {
  const parsed = parseDay(day);
  if (!parsed) return day;
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + amount));
  return next.toISOString().slice(0, 10);
}

export function midnightUtc(day: string, timeZone: string): number {
  const parsed = parseDay(day);
  if (!parsed) return Date.parse(`${day}T00:00:00Z`);
  return wallToUtc(parsed.year, parsed.month, parsed.day, 0, 0, timeZone);
}

export function formatHm(utcMs: number, timeZone: string): string {
  const parts = partsInZone(utcMs, timeZone);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function formatOffset(utcMs: number, timeZone: string): string {
  // Round to the minute. A raw offset is short by the leftover milliseconds,
  // which otherwise floors a whole hour into "2:59".
  const rounded = Math.round(offsetMs(utcMs, timeZone) / 60_000) * 60_000;
  if (rounded === 0) return "UTC";
  const sign = rounded > 0 ? "+" : "−";
  const abs = Math.abs(rounded);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  return minutes ? `UTC${sign}${hours}:${pad2(minutes)}` : `UTC${sign}${hours}`;
}

export function formatDayLabel(day: string): string {
  const parsed = parseDay(day);
  if (!parsed) return day;
  const noon = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(noon));
}

export function formatLength(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
  if (!rest) return hourLabel;
  return `${hourLabel} ${rest} minutes`;
}

export function minutesToInput(minutes: number): string {
  const clamped = Math.min(24 * 60, Math.max(0, minutes));
  const hour = Math.floor(clamped / 60) % 24;
  const minute = clamped % 60;
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function inputToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
