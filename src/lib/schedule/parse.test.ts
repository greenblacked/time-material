import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectBusy, collectEvents } from "./parse.ts";

describe("calendar parsing", () => {
  it("reads a Zoom conference and ignores a title that only says zoom", () => {
    const events = collectEvents({
      items: [
        {
          id: "z1",
          summary: "Design review",
          start: { dateTime: "2026-10-06T13:00:00Z" },
          end: { dateTime: "2026-10-06T13:30:00Z" },
          conferenceData: {
            conferenceSolution: { name: "Zoom Meeting" },
            entryPoints: [{ uri: "https://zoom.us/j/93831668388?pwd=secret" }],
          },
        },
        {
          id: "t1",
          summary: "Zoom out on the roadmap",
          start: { dateTime: "2026-10-06T15:00:00Z" },
          end: { dateTime: "2026-10-06T15:30:00Z" },
        },
        {
          id: "day",
          summary: "Holiday",
          start: { date: "2026-10-06" },
          end: { date: "2026-10-07" },
        },
      ],
    });
    assert.equal(events.length, 3);
    assert.equal(events[0]?.isZoom, true);
    assert.equal(events[0]?.zoomUrl, "https://zoom.us/j/93831668388?pwd=secret");
    assert.equal(events[0]?.blocksTime, true);
    assert.equal(events[1]?.isZoom, false);
    assert.equal(events[2]?.allDay, true);
    assert.equal(events[2]?.blocksTime, false);
  });

  it("reads free/busy intervals and skips bare ranges that are not events", () => {
    const busy = collectBusy({
      calendars: {
        primary: {
          busy: [
            { start: "2026-10-06T13:00:00Z", end: "2026-10-06T14:00:00Z" },
            { start: "not-a-date", end: "2026-10-06T15:00:00Z" },
          ],
        },
      },
    });
    assert.equal(busy.length, 1);
    assert.equal(collectEvents({ calendars: { primary: { busy: busy } } }).length, 0);
  });
});
