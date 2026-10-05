import type { ScheduleEvent, ScheduleResponse } from "../schedule/types.ts";
import { zoomLabel } from "../schedule/parse.ts";
import { clampCut, viewBounds, type Board } from "./board.ts";
import {
  axisMinutes,
  findOpenings,
  searchWindow,
  spanInWork,
  utcFromAxisMinutes,
  type Interval,
  type Place,
} from "./intersect.ts";
import {
  todayInZone,
  parseDay,
  wallToUtc,
  midnightUtc,
  dayMinutes,
  formatDayLabel,
  formatHm,
  formatLength,
  partsInZone,
} from "./zoned.ts";

export type PlaceReadout = {
  place: Place;
  axis: boolean;
  localStart: string;
  localEnd: string;
  inWork: boolean;
  weekend: boolean;
};

export type PartialOpening = {
  without: Place;
  interval: Interval;
};

export type Derived = {
  axis: Place;
  viewStartMin: number;
  viewEndMin: number;
  hours: number[];
  cutStartUtc: number;
  cutEndUtc: number;
  openings: Interval[];
  fitted: Interval[];
  partials: PartialOpening[];
  readouts: PlaceReadout[];
  everyoneIn: boolean;
  busyHits: Interval[];
  eventHits: ScheduleEvent[];
  zoomHits: ScheduleEvent[];
  zoomInView: ScheduleEvent[];
  timedEvents: ScheduleEvent[];
  allDay: ScheduleEvent[];
  sharedBands: { startMin: number; endMin: number }[];
};

function toInterval(start: string, end: string): Interval | null {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return { start: a, end: b };
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function hourMarks(startMin: number, endMin: number): number[] {
  const marks: number[] = [];
  for (let minute = startMin; minute < endMin; minute += 60) marks.push(minute);
  return marks;
}

function clipBand(
  interval: Interval,
  zone: string,
  day: string,
  viewStart: number,
  viewEnd: number,
): { startMin: number; endMin: number } | null {
  const startMin = Math.max(viewStart, axisMinutes(interval.start, zone, day));
  const endMin = Math.min(viewEnd, axisMinutes(interval.end, zone, day));
  if (endMin - startMin < 1) return null;
  return { startMin, endMin };
}

export function derive(board: Board, schedule: ScheduleResponse | null): Derived {
  const axis = board.places[0] ?? {
    zone: "UTC",
    label: "UTC",
    workStart: 9 * 60,
    workEnd: 17 * 60,
  };
  let { startMin, endMin } = viewBounds(board.span, dayMinutes(board.day, axis.zone));
  const date = parseDay(board.day);
  if (board.span === "workday" && date) {
    const midnight = midnightUtc(board.day, axis.zone);
    startMin = (wallToUtc(date.year, date.month, date.day, 7, 0, axis.zone) - midnight) / 60_000;
    endMin = (wallToUtc(date.year, date.month, date.day, 20, 0, axis.zone) - midnight) / 60_000;
  }
  const cutMinutes = clampCut(board.cutMinutes, 5, dayMinutes(board.day, axis.zone));
  const cutStartUtc = utcFromAxisMinutes(cutMinutes, axis.zone, board.day);
  const cutEndUtc = cutStartUtc + board.durationMin * 60_000;
  const cut: Interval = { start: cutStartUtc, end: cutEndUtc };
  const window = searchWindow(board.day, axis.zone);
  const calendarOn = schedule?.status === "ok";
  const busy = calendarOn
    ? (schedule?.busy ?? [])
        .map((span) => toInterval(span.start, span.end))
        .filter((span): span is Interval => span !== null)
    : [];
  const events = calendarOn ? (schedule?.events ?? []) : [];
  const blockingEvents = events
    .filter((event) => event.blocksTime)
    .map((event) => toInterval(event.start, event.end))
    .filter((span): span is Interval => span !== null);
  const busyAll = calendarOn ? busy.concat(blockingEvents) : [];
  const openings = findOpenings(
    board.places,
    board.weekdaysOnly,
    window.from,
    window.to,
    busyAll,
    Math.min(15, board.durationMin) * 60_000,
  );
  const fitted = openings.filter(
    (interval) => interval.end - interval.start >= board.durationMin * 60_000,
  );
  const bestFull = openings.reduce<Interval | undefined>(
    (best, interval) =>
      !best || interval.end - interval.start > best.end - best.start ? interval : best,
    undefined,
  );
  const partials: PartialOpening[] = [];
  if (board.places.length > 1) {
    for (const without of board.places) {
      const rest = board.places.filter((place) => place.zone !== without.zone);
      const alt = findOpenings(
        rest,
        board.weekdaysOnly,
        window.from,
        window.to,
        busyAll,
        Math.min(15, board.durationMin) * 60_000,
      );
      const longest = alt.reduce<Interval | null>(
        (best, interval) =>
          !best || interval.end - interval.start > best.end - best.start ? interval : best,
        null,
      );
      if (!longest) continue;
      const fullLength = bestFull ? bestFull.end - bestFull.start : 0;
      if (longest.end - longest.start < fullLength + 30 * 60_000) continue;
      partials.push({ without, interval: longest });
    }
    partials.sort(
      (a, b) => b.interval.end - b.interval.start - (a.interval.end - a.interval.start),
    );
  }
  const readouts: PlaceReadout[] = board.places.map((place, index) => {
    const local = partsInZone(cutStartUtc, place.zone);
    return {
      place,
      axis: index === 0,
      localStart: formatHm(cutStartUtc, place.zone, board.clockFormat),
      localEnd: formatHm(cutEndUtc, place.zone, board.clockFormat),
      inWork: spanInWork(place, cutStartUtc, cutEndUtc, board.weekdaysOnly),
      weekend: local.weekday === 0 || local.weekday === 6,
    };
  });
  const timedEvents = events.filter((event) => !event.allDay);
  const zoomInView = timedEvents.filter((event) => event.isZoom);
  return {
    axis,
    viewStartMin: startMin,
    viewEndMin: endMin,
    hours: hourMarks(startMin, endMin),
    cutStartUtc,
    cutEndUtc,
    openings,
    fitted,
    partials: partials.slice(0, 3),
    readouts,
    everyoneIn: readouts.every((row) => row.inWork),
    busyHits: busy.filter((span) => overlaps(span, cut)),
    eventHits: timedEvents.filter((event) => {
      const span = toInterval(event.start, event.end);
      return span ? overlaps(span, cut) : false;
    }),
    zoomHits: timedEvents.filter((event) => {
      if (!event.isZoom) return false;
      const span = toInterval(event.start, event.end);
      return span ? overlaps(span, cut) : false;
    }),
    zoomInView,
    timedEvents,
    allDay: events.filter((event) => event.allDay),
    sharedBands: openings
      .map((interval) => clipBand(interval, axis.zone, board.day, startMin, endMin))
      .filter((band): band is { startMin: number; endMin: number } => band !== null),
  };
}

export function meetingBrief(
  board: Board,
  view: Derived,
  schedule: ScheduleResponse | null,
): string {
  const lines = [
    "Time Material",
    formatDayLabel(board.day),
    formatLength(board.durationMin * 60_000),
    "",
    ...view.readouts.map(
      (row) =>
        `${row.place.label} ${todayInZone(row.place.zone, view.cutStartUtc)} ${row.localStart}–${todayInZone(row.place.zone, view.cutEndUtc)} ${row.localEnd}${row.inWork ? "" : " (outside work hours)"}`,
    ),
    "",
    view.everyoneIn
      ? "Everyone is inside work hours for the whole meeting."
      : "Not everyone is inside work hours for the whole meeting.",
  ];
  if (!schedule || schedule.status !== "ok") {
    lines.push("Calendar was not applied.");
  } else if (view.busyHits.length === 0 && view.eventHits.length === 0) {
    lines.push("Nothing on the calendar overlaps this cut.");
  } else {
    const names = view.eventHits.map((event) => event.title);
    lines.push(
      names.length
        ? `Calendar overlaps: ${names.join(", ")}.`
        : "The calendar is busy in this cut.",
    );
  }
  if (schedule?.status === "ok") {
    lines.push(
      view.zoomHits.length
        ? `Zoom already in this cut: ${view.zoomHits.map((event) => event.title).join(", ")}.`
        : "No Zoom call in this cut.",
    );
  }
  return lines.join("\n");
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsStamp(utcMs: number): string {
  const date = new Date(utcMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function meetingIcs(board: Board, view: Derived, schedule: ScheduleResponse | null): string {
  const brief = meetingBrief(board, view, schedule);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Time Material//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${view.cutStartUtc}@time-material`,
    `DTSTAMP:${icsStamp(view.cutStartUtc)}`,
    `DTSTART:${icsStamp(view.cutStartUtc)}`,
    `DTEND:${icsStamp(view.cutEndUtc)}`,
    "SUMMARY:Meeting",
    `DESCRIPTION:${icsEscape(brief)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function safeZoomHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (host !== "zoom.us" && !host.endsWith(".zoom.us")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export { zoomLabel };

export function googleCalendarUrl(
  board: Board,
  view: Derived,
  schedule: ScheduleResponse | null,
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "Meeting",
    dates: `${icsStamp(view.cutStartUtc)}/${icsStamp(view.cutEndUtc)}`,
    details: meetingBrief(board, view, schedule),
    ctz: view.axis.zone,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
