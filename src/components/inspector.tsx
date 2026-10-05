import { Copy, Download } from "lucide-react";
import type { Board } from "@/lib/time/board";
import { type Derived } from "@/lib/time/derive";
import type { Interval } from "@/lib/time/intersect";
import { formatHm, formatLength, dayMinutes, todayInZone } from "@/lib/time/zoned";
import { Button } from "./ui";

type InspectorProps = {
  board: Board;
  view: Derived;
  onDuration: (minutes: number) => void;
  onFocus: (interval: Interval) => void;
  onCopy: () => void;
  copied: boolean;
  onDownload: () => void;
  onRange: (cut: number, duration: number) => void;
  onLink: () => void;
  linkCopied: boolean;
  calendarUrl: string;
};

const DURATIONS = [30, 45, 60, 90] as const;

export function Inspector({
  board,
  view,
  onDuration,
  onFocus,
  onCopy,
  copied,
  onDownload,
  onRange,
  onLink,
  linkCopied,
  calendarUrl,
}: InspectorProps) {
  const longest = view.openings.reduce(
    (best, interval) => Math.max(best, interval.end - interval.start),
    0,
  );
  const shorter = [30, 45, 60, 90].filter((minutes) => minutes * 60_000 <= longest).at(-1);

  return (
    <section aria-label="Selected meeting" className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-medium leading-tight">Selected meeting</h2>
        <p className="mt-1 text-sm tabular-nums">
          {view.readouts[0] ? `${view.readouts[0].localStart}–${view.readouts[0].localEnd}` : "—"}
          <span className="text-mute"> · {formatLength(board.durationMin * 60_000)}</span>
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {view.readouts.map((row) => (
          <li key={row.place.zone} className="flex items-baseline justify-between gap-3">
            <span>
              <span className="block text-sm">{row.place.label}</span>
              <span
                className={`text-xs ${row.inWork ? "text-good" : row.weekend ? "text-mute" : "text-warn"}`}
              >
                {row.inWork ? "In work hours" : row.weekend ? "Weekend" : "Outside work hours"}
              </span>
            </span>
            <span className="text-sm tabular-nums">
              <span className="block">
                {row.localStart}–{row.localEnd}
              </span>
              <span className="block text-xs text-mute">
                {todayInZone(row.place.zone, view.cutStartUtc)}
                {todayInZone(row.place.zone, view.cutEndUtc) !==
                todayInZone(row.place.zone, view.cutStartUtc)
                  ? ` → ${todayInZone(row.place.zone, view.cutEndUtc)}`
                  : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <details>
        <summary className="cursor-pointer text-sm">Meeting details</summary>
        <div className="glass-menu mt-3 grid gap-4 p-3 lg:grid-cols-2">
          {" "}
          <div role="radiogroup" aria-label="Meeting length" className="grid grid-cols-4 gap-2">
            {DURATIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                role="radio"
                aria-checked={board.durationMin === minutes}
                className={`press h-11 rounded-sm border border-line bg-canvas text-sm tabular-nums text-ink ${
                  board.durationMin === minutes ? "is-on" : ""
                }`}
                onClick={() => onDuration(minutes)}
              >
                {minutes}
              </button>
            ))}
          </div>
          <label className="text-sm">
            Duration in minutes
            <input
              type="number"
              aria-label="Duration in minutes"
              min={5}
              max={1440}
              step={5}
              value={board.durationMin}
              className="mt-1 h-11 w-full border border-line bg-canvas px-2"
              onChange={(event) => {
                if (event.target.value) onDuration(Number(event.target.value));
              }}
            />
          </label>
          <details>
            <summary className="cursor-pointer text-sm">Adjust meeting</summary>
            <div className="glass-menu mt-2 grid grid-cols-2 gap-2 p-3">
              {(["start", "end"] as const).map((edge) => (
                <label key={edge} className="text-xs">
                  Meeting {edge} (minutes from midnight)
                  <input
                    type="number"
                    aria-label={`Meeting ${edge}`}
                    min={0}
                    max={dayMinutes(board.day, view.axis.zone) + 1440}
                    step={5}
                    className="mt-1 h-11 w-full border border-line bg-canvas px-2"
                    value={
                      edge === "start" ? board.cutMinutes : board.cutMinutes + board.durationMin
                    }
                    onChange={(event) => {
                      if (!event.target.value) return;
                      const minute = Number(event.target.value);
                      if (edge === "start") onRange(minute, board.durationMin);
                      else onRange(board.cutMinutes, minute - board.cutMinutes);
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
          <p className="text-sm">
            {view.everyoneIn ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-good" aria-hidden />
                <span className="font-medium text-good">Inside work hours</span>
                <span>for everyone.</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-warn" aria-hidden />
                <span className="font-medium text-warn">Outside work hours</span>
                <span>for someone.</span>
              </span>
            )}
          </p>
          <details>
            <summary className="cursor-pointer text-sm">Shared hours</summary>
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <h3 className="text-sm font-medium">Shared hours</h3>
              {view.fitted.length === 0 ? (
                <p className="text-sm text-mute">
                  {longest > 0
                    ? `The longest share is ${formatLength(longest)}, shorter than this meeting.`
                    : "No shared working hours in this window."}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {view.fitted.slice(0, 4).map((interval) => (
                    <li key={`${interval.start}-${interval.end}`}>
                      <button
                        type="button"
                        className="press flex h-11 w-full items-center justify-between rounded-sm border border-line px-3 text-left text-sm"
                        onClick={() => onFocus(interval)}
                      >
                        <span className="tabular-nums">
                          {formatHm(interval.start, view.axis.zone, board.clockFormat)}–
                          {formatHm(interval.end, view.axis.zone, board.clockFormat)}
                        </span>
                        <span className="text-mute">
                          {formatLength(interval.end - interval.start)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {view.fitted.length === 0 && shorter && shorter !== board.durationMin ? (
                <Button variant="quiet" onClick={() => onDuration(shorter)}>
                  Use {shorter} minutes
                </Button>
              ) : null}
              {view.partials.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {view.partials.map((partial) => (
                    <li key={partial.without.zone}>
                      <button
                        type="button"
                        className="press flex min-h-11 w-full flex-col items-start justify-center rounded-sm px-1 text-left text-sm"
                        onClick={() => onFocus(partial.interval)}
                      >
                        <span>Without {partial.without.label}</span>
                        <span className="text-mute tabular-nums">
                          {formatHm(partial.interval.start, view.axis.zone, board.clockFormat)}–
                          {formatHm(partial.interval.end, view.axis.zone, board.clockFormat)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" onClick={onLink}>
          {linkCopied ? "Link copied" : "Copy link"}
        </Button>
        <a
          className="press inline-flex min-h-11 items-center rounded-sm border border-line px-3 text-sm"
          href={calendarUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open in Google Calendar
        </a>
        <Button variant="solid" onClick={onCopy}>
          <Copy aria-hidden className="size-4" />
          {copied ? "Copied" : "Copy brief"}
        </Button>
        <Button variant="quiet" onClick={onDownload}>
          <Download aria-hidden className="size-4" />
          Calendar file
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? "Brief copied." : ""}
      </p>
    </section>
  );
}
