import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boardFromQuery,
  boardToQuery,
  defaultBoard,
  sanitizeBoard,
  selectionRange,
  resizeSelection,
  withPlaces,
  placeForZone,
  applyDeviceZone,
} from "./board.ts";
import { derive, googleCalendarUrl, meetingIcs, meetingBrief } from "./derive.ts";
import { dayMinutes, parseDay, formatHm, formatClockMinutes } from "./zoned.ts";
const now = Date.parse("2026-10-05T12:00:00Z");
test("old state and links have display defaults; custom names and preferences roundtrip", () => {
  const board = defaultBoard(now);
  const old = sanitizeBoard(
    { ...board, clockFormat: undefined, showTimezone: undefined, markWeekends: undefined },
    now,
  );
  assert.equal(old.clockFormat, "24h");
  assert.equal(old.showTimezone, true);
  const custom = {
    ...board,
    places: [{ ...board.places[0]!, label: "My office & team" }],
    clockFormat: "mixed" as const,
    showTimezone: false,
    markWeekends: false,
    cutMinutes: 965,
    durationMin: 35,
  };
  assert.deepEqual(boardFromQuery(boardToQuery(custom), now), custom);
  assert.equal(boardFromQuery("p=UTC,540,1020", now)?.durationMin, 60);
});
test("invalid dates and nonfinite input cannot produce NaN", () => {
  assert.equal(parseDay("2026-02-30"), null);
  assert.equal(parseDay("2024-02-29")?.day, 29);
  const board = boardFromQuery("p=UTC,540,1020&d=2026-02-30&dur=oops&cut=NaN", now)!;
  assert.equal(board.durationMin, 60);
  assert.equal(board.cutMinutes, 0);
  assert.ok(Number.isFinite(derive(board, null).cutStartUtc));
});
test("elapsed day axis handles DST, fractional zones, and home rollover", () => {
  assert.equal(dayMinutes("2026-03-08", "America/New_York"), 1380);
  assert.equal(dayMinutes("2026-11-01", "America/New_York"), 1500);
  const board = {
    ...defaultBoard(now),
    places: [placeForZone("America/New_York")!],
    day: "2026-11-01",
    cutMinutes: 1465,
    durationMin: 35,
    span: "day" as const,
  };
  const original = derive(board, null);
  assert.equal(original.viewEndMin, 1500);
  const changed = withPlaces(board, [placeForZone("Asia/Kathmandu")!, ...board.places]);
  assert.equal(derive(changed, null).cutStartUtc, original.cutStartUtc);
  assert.equal(derive(changed, null).cutEndUtc, original.cutEndUtc);
  assert.equal(formatHm(Date.parse("2026-10-05T12:00:00Z"), "Asia/Kathmandu"), "17:45");
  assert.equal(formatHm(now, "America/New_York", "mixed"), "8:00 AM");
  assert.equal(formatHm(now, "Europe/London", "mixed"), "13:00");
});
test("draw and resize reverse, snap, and clamp", () => {
  assert.deepEqual(selectionRange(600, 540, 1440), { cutMinutes: 540, durationMin: 60 });
  assert.deepEqual(selectionRange(602, 637, 1440, 5), { cutMinutes: 600, durationMin: 35 });
  assert.deepEqual(selectionRange(-200, 1600, 1440), { cutMinutes: 0, durationMin: 1440 });
  assert.deepEqual(selectionRange(1440, 1440, 1440), { cutMinutes: 1435, durationMin: 5 });
});
test("calendar exports preserve exact UTC range including DST and five minute meetings", () => {
  const board = {
    ...defaultBoard(now),
    places: [placeForZone("America/New_York")!],
    day: "2026-11-01",
    cutMinutes: 125,
    durationMin: 5,
  };
  const view = derive(board, null);
  const params = new URL(googleCalendarUrl(board, view, null)).searchParams;
  assert.equal(params.get("dates"), "20261101T060500Z/20261101T061000Z");
  assert.match(meetingIcs(board, view, null), /DTSTART:20261101T060500Z\r\nDTEND:20261101T061000Z/);
  assert.match(params.get("details")!, /Calendar was not applied/);
});

test("resize fixes the other edge and stops at five minutes on crossing", () => {
  assert.deepEqual(resizeSelection("end", 1041, 965, 60, 1440), {
    cutMinutes: 965,
    durationMin: 70,
  });
  assert.deepEqual(resizeSelection("start", 994, 965, 60, 1440), {
    cutMinutes: 990,
    durationMin: 35,
  });
  assert.deepEqual(resizeSelection("end", 900, 965, 60, 1440), { cutMinutes: 965, durationMin: 5 });
  assert.deepEqual(resizeSelection("start", 1100, 965, 60, 1440), {
    cutMinutes: 1020,
    durationMin: 5,
  });
});
test("workday view keeps local 07 to 20 across DST", () => {
  for (const day of ["2026-03-08", "2026-11-01"]) {
    const board = { ...defaultBoard(now), places: [placeForZone("America/New_York")!], day };
    const view = derive(board, null);
    assert.equal(
      formatHm(
        view.cutStartUtc - board.cutMinutes * 60000 + view.viewStartMin * 60000,
        view.axis.zone,
      ),
      "07:00",
    );
    assert.equal(
      formatHm(
        view.cutStartUtc - board.cutMinutes * 60000 + view.viewEndMin * 60000,
        view.axis.zone,
      ),
      "20:00",
    );
  }
});

test("five minute meetings include a five minute gap between busy intervals", () => {
  const board = { ...defaultBoard(now), places: [placeForZone("UTC")!], durationMin: 5 };
  const view = derive(board, {
    status: "ok",
    message: "Read",
    events: [],
    busy: [
      { start: "2026-10-05T09:00:00Z", end: "2026-10-05T12:00:00Z" },
      { start: "2026-10-05T12:05:00Z", end: "2026-10-05T17:00:00Z" },
    ],
  });
  assert.ok(
    view.fitted.some(
      (interval) =>
        interval.start === Date.parse("2026-10-05T12:00:00Z") &&
        interval.end === Date.parse("2026-10-05T12:05:00Z"),
    ),
  );
});

test("meeting brief identifies each city's dates when a meeting crosses midnight", () => {
  const board = {
    ...defaultBoard(now),
    places: [placeForZone("UTC")!, placeForZone("Asia/Kathmandu")!],
    day: "2026-10-05",
    cutMinutes: 23 * 60 + 30,
    durationMin: 60,
  };
  const brief = meetingBrief(board, derive(board, null), null);
  assert.match(brief, /UTC 2026-10-05 23:30–2026-10-06 00:30/);
  assert.match(brief, /Kathmandu 2026-10-06 05:15–2026-10-06 06:15/);
  assert.match(brief, /Calendar was not applied/);
});

test("distinct worldwide cities sharing a timezone retain their names and regions in state and links", () => {
  const base = placeForZone("Europe/London")!;
  const places = [
    { ...base, cityId: "2638077", label: "Sheffield", region: "England, United Kingdom" },
    { ...base, cityId: "2655603", label: "Birmingham", region: "England, United Kingdom" },
  ];
  const board = sanitizeBoard({ ...defaultBoard(now), places: [...places, places[0]] }, now);
  assert.deepEqual(board.places, places);
  assert.deepEqual(boardFromQuery(boardToQuery(board), now)?.places, places);
  assert.deepEqual(sanitizeBoard(JSON.parse(JSON.stringify(board)), now).places, places);
});

test("long recorded city names survive reload and sharing", () => {
  const name =
    "United Townships of Dysart, Dudley, Harcourt, Guilford, Harburn, Bruton, Havelock, Eyre and Clyde";
  const city = {
    ...placeForZone("America/Toronto")!,
    cityId: "13680011",
    label: name,
    region: "Ontario, Canada",
  };
  const board = sanitizeBoard({ ...defaultBoard(now), places: [city] }, now);
  assert.equal(board.places[0]?.label, name);
  assert.equal(boardFromQuery(boardToQuery(board), now)?.places[0]?.label, name);
});

test("device zone aliases resolve to the seeded city instead of a duplicate row", () => {
  const board = applyDeviceZone(defaultBoard(now), "Europe/Kiev", now);
  assert.equal(board.places[0]?.zone, "Europe/Kyiv");
  assert.equal(board.places[0]?.label, "Kyiv");
  assert.equal(
    board.places.filter((place) => ["Europe/Kyiv", "Europe/Kiev"].includes(place.zone)).length,
    1,
  );
});

test("clock minutes follow the board time format", () => {
  assert.equal(formatClockMinutes(9 * 60, "Europe/London", "24h"), "09:00");
  assert.equal(formatClockMinutes(17 * 60 + 30, "Europe/London", "12h"), "5:30 PM");
  assert.equal(formatClockMinutes(1440, "Europe/London", "24h"), "24:00");
  assert.equal(formatClockMinutes(1440, "Europe/London", "12h"), "12:00 AM");
});
