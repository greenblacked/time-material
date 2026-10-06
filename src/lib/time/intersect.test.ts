import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultBoard } from "./board.ts";
import { derive, meetingBrief } from "./derive.ts";
import { findOpenings, inWork, type Place } from "./intersect.ts";
import { wallToUtc, formatOffset } from "./zoned.ts";

const places: Place[] = [
  { zone: "Europe/Kyiv", label: "Kyiv", workStart: 9 * 60, workEnd: 17 * 60 },
  { zone: "Europe/London", label: "London", workStart: 9 * 60, workEnd: 17 * 60 },
  { zone: "America/New_York", label: "New York", workStart: 9 * 60, workEnd: 17 * 60 },
];

describe("shared working hours", () => {
  it("finds the one-hour overlap of Kyiv, London and New York on a weekday", () => {
    const from = Date.parse("2026-10-06T00:00:00Z");
    const to = Date.parse("2026-10-06T23:00:00Z");
    const openings = findOpenings(places, true, from, to, [], 15 * 60_000);
    assert.equal(openings.length, 1);
    assert.equal(new Date(openings[0]!.start).toISOString(), "2026-10-06T13:00:00.000Z");
    assert.equal(new Date(openings[0]!.end).toISOString(), "2026-10-06T14:00:00.000Z");
  });

  it("drops Saturday when weekdays are required", () => {
    const from = Date.parse("2026-10-10T08:00:00Z");
    const to = Date.parse("2026-10-10T16:00:00Z");
    assert.equal(findOpenings(places, true, from, to, [], 15 * 60_000).length, 0);
    const saturdayNoon = wallToUtc(2026, 10, 10, 12, 0, "Europe/Kyiv");
    assert.equal(inWork(places[0]!, saturdayNoon, true), false);
    assert.equal(inWork(places[0]!, saturdayNoon, false), true);
  });

  it("subtracts calendar busy time from the share", () => {
    const from = Date.parse("2026-10-06T00:00:00Z");
    const to = Date.parse("2026-10-06T23:00:00Z");
    const busy = [
      {
        start: Date.parse("2026-10-06T13:00:00Z"),
        end: Date.parse("2026-10-06T13:30:00Z"),
      },
    ];
    const openings = findOpenings(places, true, from, to, busy, 15 * 60_000);
    assert.equal(openings.length, 1);
    assert.equal(new Date(openings[0]!.start).toISOString(), "2026-10-06T13:30:00.000Z");
    assert.equal(new Date(openings[0]!.end).toISOString(), "2026-10-06T14:00:00.000Z");
  });

  it("treats a window that crosses midnight as work", () => {
    const night: Place = {
      zone: "Europe/Kyiv",
      label: "Kyiv",
      workStart: 22 * 60,
      workEnd: 6 * 60,
    };
    const late = wallToUtc(2026, 10, 6, 23, 0, "Europe/Kyiv");
    const noon = wallToUtc(2026, 10, 6, 12, 0, "Europe/Kyiv");
    const early = wallToUtc(2026, 10, 6, 5, 0, "Europe/Kyiv");
    assert.equal(inWork(night, late, false), true);
    assert.equal(inWork(night, noon, false), false);
    assert.equal(inWork(night, early, false), true);
  });

  it("places the default cut on the shared hour", () => {
    const board = defaultBoard(Date.parse("2026-10-05T12:00:00.000Z"));
    assert.equal(board.day, "2026-10-05");
    assert.equal(board.cutMinutes, 16 * 60);
    assert.deepEqual(
      board.places.map((place) => place.label),
      ["Kyiv", "London", "New York"],
    );
  });
});

describe("offsets", () => {
  it("rounds a whole-hour zone instead of flooring to 59 minutes", () => {
    const instant = Date.parse("2026-10-05T12:00:30.500Z");
    assert.equal(formatOffset(instant, "Europe/Kyiv"), "UTC+3");
    assert.equal(formatOffset(instant, "Europe/London"), "UTC+1");
    assert.equal(formatOffset(instant, "America/New_York"), "UTC−4");
    assert.equal(formatOffset(instant, "UTC"), "UTC");
  });
});
describe("meeting brief", () => {
  it("does not claim the calendar is clear when it was not read", () => {
    const board = defaultBoard(Date.parse("2026-10-05T12:00:00.000Z"));
    const view = derive(board, null);
    const brief = meetingBrief(board, view, null);
    assert.match(brief, /Kyiv 2026-10-05 16:00–2026-10-05 17:00/);
    assert.match(brief, /London 2026-10-05 14:00–2026-10-05 15:00/);
    assert.match(brief, /New York 2026-10-05 09:00–2026-10-05 10:00/);
    assert.match(brief, /Calendar was not applied/);
    assert.doesNotMatch(brief, /clear/i);
  });
});
