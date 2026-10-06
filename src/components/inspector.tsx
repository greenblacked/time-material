import { useState } from "react";
import { CalendarPlus, Check, ChevronDown, Copy, Download, Link2 } from "lucide-react";
import type { Board } from "@/lib/time/board";
import { type Derived } from "@/lib/time/derive";
import { axisMinutes, type Interval } from "@/lib/time/intersect";
import {
  addDays,
  formatDayLabel,
  formatHm,
  formatLength,
  parseDay,
  partsInZone,
  todayInZone,
  wallToUtc,
} from "@/lib/time/zoned";
import { buttonClass } from "./button-class";
import { Button, Segmented, TimeSelect } from "./ui";

type InspectorProps = {
  board: Board;
  view: Derived;
  onDuration: (minutes: number) => void;
  onFocus: (interval: Interval) => void;
  onCopy: () => void;
  copied: boolean;
  copyError: boolean;
  onDownload: () => void;
  onRange: (cut: number, duration: number) => void;
  onLink: () => void;
  linkCopied: boolean;
  calendarUrl: string;
};

const DURATIONS = [
  { value: 30, label: "30m" },
  { value: 45, label: "45m" },
  { value: 60, label: "1h" },
  { value: 90, label: "1.5h" },
];

function shortLength(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Wall-clock minutes from local midnight of an instant in a zone. */
function wallMinutes(utc: number, zone: string): number {
  const parts = partsInZone(utc, zone);
  return parts.hour * 60 + parts.minute;
}

/** The instant a wall-clock time has on a local date (DST aware). */
function wallInstant(day: string, minutes: number, zone: string): number {
  const date = parseDay(day);
  if (!date) return Number.NaN;
  return wallToUtc(date.year, date.month, date.day, Math.floor(minutes / 60), minutes % 60, zone);
}

function StatusChip({ inWork, weekend }: { inWork: boolean; weekend: boolean }) {
  const tone = inWork ? "text-good" : weekend ? "text-mute" : "text-warn";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone}`}>
      <span className="status-dot" aria-hidden />
      {inWork ? "Work hours" : weekend ? "Weekend" : "Outside hours"}
    </span>
  );
}

export function Inspector({
  board,
  view,
  onDuration,
  onFocus,
  onCopy,
  copied,
  copyError,
  onDownload,
  onRange,
  onLink,
  linkCopied,
  calendarUrl,
}: InspectorProps) {
  const [customDuration, setCustomDuration] = useState<string | null>(null);
  const longest = view.openings.reduce(
    (best, interval) => Math.max(best, interval.end - interval.start),
    0,
  );
  const shorter = [30, 45, 60, 90].filter((minutes) => minutes * 60_000 <= longest).at(-1);
  const reference = view.readouts[0];
  const referenceDay = todayInZone(view.axis.zone, view.cutStartUtc);
  const fmt = (utc: number) => formatHm(utc, view.axis.zone, board.clockFormat);
  /** Weekday prefix for openings on another day than the board date. */
  const otherDay = (utc: number) => {
    const day = todayInZone(view.axis.zone, utc);
    return day === board.day ? null : formatDayLabel(day).split(",")[0];
  };
  // The same opening can be reported twice; show each interval once.
  const fitted = view.fitted.filter(
    (interval, index, all) =>
      all.findIndex((other) => other.start === interval.start && other.end === interval.end) ===
      index,
  );
  const presetDuration = DURATIONS.some((item) => item.value === board.durationMin)
    ? board.durationMin
    : null;

  return (
    <section
      aria-labelledby="meeting-heading"
      className="panel grid grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:gap-x-8"
    >
      <header className="flex flex-col gap-1 lg:col-span-2">
        <h2 id="meeting-heading" className="text-base font-semibold">
          Selected meeting
        </h2>
        <p className="text-sm text-mute tabular-nums">
          {formatDayLabel(referenceDay).replace(/ \d{4}$/, "")} ·{" "}
          {reference ? `${reference.localStart}–${reference.localEnd}` : "—"} ·{" "}
          {shortLength(board.durationMin)}
        </p>
        <p
          className={`mt-1 inline-flex items-center gap-2 text-sm font-medium ${view.everyoneIn ? "text-good" : "text-warn"}`}
        >
          <span className="status-dot size-2" aria-hidden />
          {view.everyoneIn ? "Inside work hours for everyone" : "Outside work hours for someone"}
        </p>
      </header>

      {/* Left: the times per city and alternatives. Right (lg): details and the actions. */}
      <div className="flex min-w-0 flex-col gap-4">
        <ul className="grid border-y border-line text-sm sm:w-fit sm:grid-cols-[minmax(8rem,16rem)_auto_auto] sm:gap-x-8 lg:w-full lg:grid-cols-[minmax(8rem,1fr)_auto_auto]">
          {view.readouts.map((row) => {
            const startDay = todayInZone(row.place.zone, view.cutStartUtc);
            const endDay = todayInZone(row.place.zone, view.cutEndUtc);
            return (
              <li
                key={row.place.cityId ?? row.place.zone}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-line py-2 last:border-b-0 sm:col-span-3 sm:grid-cols-subgrid"
              >
                <span className="min-w-0 truncate">{row.place.label}</span>
                <span className="row-span-2 whitespace-nowrap text-right font-medium tabular-nums sm:row-span-1">
                  {row.localStart}–{row.localEnd}
                  {startDay !== referenceDay || endDay !== startDay ? (
                    <span className="block text-xs font-normal text-mute">
                      {startDay}
                      {endDay !== startDay ? ` → ${endDay}` : ""}
                    </span>
                  ) : null}
                </span>
                <span className="col-start-1 sm:col-start-3 sm:row-start-1">
                  <StatusChip inWork={row.inWork} weekend={row.weekend} />
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2">
          <h3 className="eyebrow">Other times that work</h3>
          {fitted.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-mute">
                {longest > 0
                  ? `The longest shared window is ${formatLength(longest)}, shorter than this meeting.`
                  : "No shared working hours in this window."}
              </p>
              {shorter && shorter !== board.durationMin ? (
                <Button variant="quiet" onClick={() => onDuration(shorter)}>
                  Use {shorter} minutes
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {fitted.slice(0, 4).map((interval) => (
                <li key={`${interval.start}-${interval.end}`}>
                  <button
                    type="button"
                    className={buttonClass("quiet", "tabular-nums")}
                    onClick={() => onFocus(interval)}
                  >
                    {otherDay(interval.start) ? (
                      <span className="font-normal text-mute">{otherDay(interval.start)}</span>
                    ) : null}
                    {fmt(interval.start)}–{fmt(interval.end)}
                    <span className="font-normal text-mute">
                      {shortLength(Math.round((interval.end - interval.start) / 60_000))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {view.partials.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Times that work for all but one city">
              {view.partials.map((partial) => (
                <li key={partial.without.cityId ?? partial.without.zone}>
                  <button
                    type="button"
                    className={buttonClass("quiet", "border-dashed tabular-nums")}
                    onClick={() => onFocus(partial.interval)}
                  >
                    <span className="font-normal text-mute">
                      Without {partial.without.label}
                      {otherDay(partial.interval.start)
                        ? ` · ${otherDay(partial.interval.start)}`
                        : ""}
                    </span>
                    {fmt(partial.interval.start)}–{fmt(partial.interval.end)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:border-line lg:pl-8">
        <details className="group">
          <summary className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium">
            Meeting details
            <ChevronDown
              aria-hidden
              className="size-4 text-mute transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-[max-content_1fr] sm:items-center sm:gap-x-6">
            <span className="field-label">Duration</span>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Meeting length"
                options={DURATIONS}
                value={presetDuration}
                onChange={(minutes) => {
                  setCustomDuration(null);
                  onDuration(minutes);
                }}
              />
              <label className="inline-flex items-center gap-2 text-sm text-mute">
                Custom
                <input
                  type="number"
                  aria-label="Duration in minutes"
                  min={5}
                  max={1440}
                  step={5}
                  value={customDuration ?? board.durationMin}
                  className="field w-20"
                  onChange={(event) => {
                    setCustomDuration(event.target.value);
                    if (event.target.value) onDuration(Number(event.target.value));
                  }}
                  onBlur={() => setCustomDuration(null)}
                />
                min
              </label>
            </div>
            <span className="field-label">Time ({view.axis.label})</span>
            <div className="flex flex-wrap items-center gap-2">
              {(["start", "end"] as const).map((edge) => (
                <label key={edge} className="inline-flex items-center gap-2 text-sm text-mute">
                  <span className="w-9">{edge === "start" ? "Start" : "End"}</span>
                  <TimeSelect
                    label={`Meeting ${edge} time`}
                    format={board.clockFormat}
                    zone={view.axis.zone}
                    step={15}
                    value={wallMinutes(
                      edge === "start" ? view.cutStartUtc : view.cutEndUtc,
                      view.axis.zone,
                    )}
                    onChange={(minute) => {
                      // Board minutes are elapsed time since the board date's local midnight,
                      // so map the wall-clock choice through the axis zone (DST days differ).
                      const zone = view.axis.zone;
                      const startDay = todayInZone(zone, view.cutStartUtc);
                      if (edge === "start") {
                        const utc = wallInstant(startDay, minute, zone);
                        if (Number.isFinite(utc))
                          onRange(Math.round(axisMinutes(utc, zone, board.day)), board.durationMin);
                        return;
                      }
                      let end = wallInstant(startDay, minute, zone);
                      if (end <= view.cutStartUtc)
                        end = wallInstant(addDays(startDay, 1), minute, zone);
                      if (Number.isFinite(end))
                        onRange(board.cutMinutes, Math.round((end - view.cutStartUtc) / 60_000));
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        </details>

        <div className="grid grid-cols-2 gap-2 border-t border-line pt-4 sm:flex sm:flex-wrap sm:items-center sm:justify-end lg:mt-auto lg:grid">
          <Button variant="ghost" onClick={onLink}>
            {linkCopied ? (
              <Check aria-hidden className="size-4 text-good" />
            ) : (
              <Link2 aria-hidden className="size-4" />
            )}
            Copy link
          </Button>
          <Button variant="quiet" onClick={onCopy}>
            {copied ? (
              <Check aria-hidden className="size-4 text-good" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
            Copy brief
          </Button>
          <Button
            variant="quiet"
            className="col-span-2 sm:col-span-1 lg:col-span-2"
            onClick={onDownload}
          >
            <Download aria-hidden className="size-4" />
            Download .ics
          </Button>
          <a
            className={buttonClass(
              "solid",
              "order-first col-span-2 sm:order-none sm:col-span-1 lg:order-first lg:col-span-2",
            )}
            href={calendarUrl}
            target="_blank"
            rel="noreferrer"
          >
            <CalendarPlus aria-hidden className="size-4" />
            Add to Google Calendar
          </a>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? "Brief copied." : linkCopied ? "Link copied." : ""}
        </p>
        {copyError ? (
          <p role="alert" className="text-xs text-warn sm:text-right lg:text-left">
            Could not copy. Select and copy manually.
          </p>
        ) : null}
      </div>
    </section>
  );
}
