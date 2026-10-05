import { CalendarDays, Copy, Download, RefreshCw } from "lucide-react";
import type { ScheduleResponse } from "@/lib/schedule/types";
import { redirectToLoginIfRequired } from "@/lib/app-data";
import type { ConnectorWaitStatus } from "@/lib/app-data";
import type { Board } from "@/lib/time/board";
import { safeZoomHref, zoomLabel, type Derived } from "@/lib/time/derive";
import type { Interval } from "@/lib/time/intersect";
import { formatHm, formatLength } from "@/lib/time/zoned";
import { Button } from "./ui";

type InspectorProps = {
  board: Board;
  view: Derived;
  schedule: ScheduleResponse | null;
  updating: boolean;
  wait: ConnectorWaitStatus;
  onDuration: (minutes: number) => void;
  onFocus: (interval: Interval) => void;
  onRefresh: () => void;
  onCopy: () => void;
  copied: boolean;
  onDownload: () => void;
};

const DURATIONS = [30, 45, 60, 90] as const;

function calendarSentence(
  schedule: ScheduleResponse | null,
  wait: ConnectorWaitStatus,
): string {
  if (!schedule) return "Reading the calendar…";
  if (schedule.status === "pending" && wait === "not_embedded") {
    return "Google Calendar is unread in this view. Open Time Material from Time Material to lay events and Zoom calls on the day. The hours still compare.";
  }
  if (schedule.status === "pending" && wait === "timed_out") {
    return "The calendar did not connect. The hours still compare.";
  }
  if (schedule.status === "pending") return "Connecting to your calendar…";
  return schedule.message;
}

export function Inspector({
  board,
  view,
  schedule,
  updating,
  wait,
  onDuration,
  onFocus,
  onRefresh,
  onCopy,
  copied,
  onDownload,
}: InspectorProps) {
  const longest = view.openings.reduce(
    (best, interval) => Math.max(best, interval.end - interval.start),
    0,
  );
  const shorter = [30, 45, 60, 90].filter((minutes) => minutes * 60_000 <= longest).at(-1);

  return (
    <aside className="panel flex flex-col gap-4 p-4 lg:sticky lg:top-24 lg:self-start">
      <div>
        <h2 className="text-xl font-medium leading-tight">The cut</h2>
        <p className="mt-1 text-sm tabular-nums">
          {view.readouts[0]
            ? `${view.readouts[0].localStart}–${view.readouts[0].localEnd}`
            : "—"}
          <span className="text-mute"> · {formatLength(board.durationMin * 60_000)}</span>
        </p>
      </div>

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

      <ul className="flex flex-col gap-3">
        {view.readouts.map((row) => (
          <li key={row.place.zone} className="flex items-baseline justify-between gap-3">
            <span>
              <span className="block text-sm">{row.place.label}</span>
              <span className={`text-xs ${row.inWork ? "text-good" : row.weekend ? "text-mute" : "text-warn"}`}>
                {row.inWork ? "In work hours" : row.weekend ? "Weekend" : "Outside work hours"}
              </span>
            </span>
            <span className="text-sm tabular-nums">
              {row.localStart}–{row.localEnd}
            </span>
          </li>
        ))}
      </ul>

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

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Calendar and Zoom</h3>
          <Button variant="ghost" onClick={onRefresh} disabled={updating} className="h-11 px-2">
            <RefreshCw aria-hidden className="size-4" />
            Refresh
          </Button>
        </div>
        <p className="text-sm text-mute">{calendarSentence(schedule, wait)}</p>
        {schedule?.status === "login" && schedule.loginUrl ? (
          <Button
            variant="solid"
            onClick={() =>
              redirectToLoginIfRequired({
                ok: false,
                data: null,
                loginRequired: true,
                loginUrl: schedule.loginUrl,
              })
            }
          >
            Continue with Time Material
          </Button>
        ) : null}
        {schedule?.status === "ok" && view.eventHits.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {view.eventHits.map((event) => {
              const href = event.isZoom ? safeZoomHref(event.zoomUrl) : null;
              return (
                <li key={event.id} className="flex items-start justify-between gap-3">
                  <span>
                    <CalendarDays aria-hidden className="mr-1 inline size-4" />
                    {event.title}
                  </span>
                  {href ? (
                    <a className="shrink-0 text-ink underline" href={href} target="_blank" rel="noreferrer">
                      {zoomLabel(href)}
                    </a>
                  ) : event.isZoom ? (
                    <span className="text-mute">Zoom</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {schedule?.status === "ok" && view.zoomHits.length > 0 ? (
          <p className="text-sm">
            <span className="font-medium text-warn">Zoom</span> already sits in this cut.
          </p>
        ) : null}
        {schedule?.status === "ok" && view.busyHits.length > 0 && view.eventHits.length === 0 ? (
          <p className="text-sm">
            <span className="font-medium text-warn">Busy</span>
            <span className="text-mute">, without a visible title.</span>
          </p>
        ) : null}
        {view.allDay.length > 0 ? (
          <p className="text-sm text-mute">
            All day: {view.allDay.map((event) => event.title).join(", ")}
          </p>
        ) : null}
      </div>

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
                    {formatHm(interval.start, view.axis.zone)}–{formatHm(interval.end, view.axis.zone)}
                  </span>
                  <span className="text-mute">{formatLength(interval.end - interval.start)}</span>
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
                    {formatHm(partial.interval.start, view.axis.zone)}–
                    {formatHm(partial.interval.end, view.axis.zone)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
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
      <p className="text-xs text-mute">
        Zoom calls are the ones the calendar event already points at. A title that merely says zoom is not enough.
      </p>
    </aside>
  );
}
