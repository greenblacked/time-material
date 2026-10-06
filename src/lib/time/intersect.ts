import { midnightUtc, partsInZone } from "./zoned.ts";

export type Place = {
  zone: string;
  label: string;
  cityId?: string;
  region?: string;
  /** Minutes from local midnight. If end is not after start, the window crosses midnight. */
  workStart: number;
  workEnd: number;
};

export type Interval = {
  start: number;
  end: number;
};

const STEP_MS = 15 * 60 * 1000;

export function inWork(place: Place, utcMs: number, weekdaysOnly: boolean): boolean {
  if (place.workStart === place.workEnd) return false;
  const local = partsInZone(utcMs, place.zone);
  if (weekdaysOnly && (local.weekday === 0 || local.weekday === 6)) return false;
  const minutes = local.hour * 60 + local.minute;
  if (place.workEnd > place.workStart) {
    return minutes >= place.workStart && minutes < place.workEnd;
  }
  return minutes >= place.workStart || minutes < place.workEnd;
}

export function spanInWork(
  place: Place,
  start: number,
  end: number,
  weekdaysOnly: boolean,
): boolean {
  if (end <= start) return false;
  for (let t = start; t < end; t += STEP_MS) {
    if (!inWork(place, t, weekdaysOnly)) return false;
  }
  return inWork(place, end - 1, weekdaysOnly);
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
    } else if (interval.end > last.end) {
      last.end = interval.end;
    }
  }
  return merged;
}

export function subtractBusy(open: Interval[], busy: Interval[]): Interval[] {
  const blocks = mergeIntervals(busy);
  const result: Interval[] = [];
  for (const interval of open) {
    let cursor = interval.start;
    for (const block of blocks) {
      if (block.end <= cursor) continue;
      if (block.start >= interval.end) break;
      if (block.start > cursor) {
        result.push({ start: cursor, end: Math.min(block.start, interval.end) });
      }
      cursor = Math.max(cursor, block.end);
      if (cursor >= interval.end) break;
    }
    if (cursor < interval.end) result.push({ start: cursor, end: interval.end });
  }
  return result.filter((interval) => interval.end > interval.start);
}

export function findOpenings(
  places: Place[],
  weekdaysOnly: boolean,
  fromUtc: number,
  toUtc: number,
  busy: Interval[],
  minMs: number,
): Interval[] {
  if (places.length === 0 || toUtc <= fromUtc) return [];
  const raw: Interval[] = [];
  let run: number | null = null;
  for (let t = fromUtc; t < toUtc; t += STEP_MS) {
    const ok = places.every((place) => inWork(place, t, weekdaysOnly));
    if (ok && run === null) run = t;
    if (!ok && run !== null) {
      raw.push({ start: run, end: t });
      run = null;
    }
  }
  if (run !== null) raw.push({ start: run, end: toUtc });
  return subtractBusy(raw, busy).filter((interval) => interval.end - interval.start >= minMs);
}

export function searchWindow(day: string, zone: string): { from: number; to: number } {
  const midnight = midnightUtc(day, zone);
  return { from: midnight - 12 * 3_600_000, to: midnight + 36 * 3_600_000 };
}

export function axisMinutes(utcMs: number, zone: string, day: string): number {
  return (utcMs - midnightUtc(day, zone)) / 60_000;
}

export function utcFromAxisMinutes(minutes: number, zone: string, day: string): number {
  return midnightUtc(day, zone) + minutes * 60_000;
}
