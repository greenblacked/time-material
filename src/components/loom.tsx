import { useRef, useState, type ReactNode } from "react";
import type { ConnectorWaitStatus } from "@/lib/app-data";
import type { ScheduleResponse } from "@/lib/schedule/types";
import type { Board } from "@/lib/time/board";
import type { Derived } from "@/lib/time/derive";
import { axisMinutes, inWork, utcFromAxisMinutes } from "@/lib/time/intersect";
import { formatHm, formatOffset, pad2, partsInZone } from "@/lib/time/zoned";

type LoomProps = {
  board: Board;
  view: Derived;
  schedule: ScheduleResponse | null;
  wait: ConnectorWaitStatus;
  now: number | null;
  onCut: (minutes: number) => void;
};

const HEAD = "h-8";
const ROW = "h-20";
const RIBBON = "h-12";

function ribbonNote(
  schedule: ScheduleResponse | null,
  wait: ConnectorWaitStatus,
): string | null {
  if (!schedule) return "Reading…";
  if (schedule.status === "ok") return null;
  if (schedule.status === "pending" && (wait === "waiting" || wait === "idle")) return "Reading…";
  return "No data";
}

function percent(minute: number, start: number, end: number): number {
  return ((minute - start) / (end - start)) * 100;
}

function spanStyle(
  startUtc: number,
  endUtc: number,
  zone: string,
  day: string,
  viewStart: number,
  viewEnd: number,
): { left: string; width: string } | null {
  if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc) || endUtc <= startUtc) return null;
  return bandStyle(
    axisMinutes(startUtc, zone, day),
    axisMinutes(endUtc, zone, day),
    viewStart,
    viewEnd,
  );
}

function bandStyle(
  startMin: number,
  endMin: number,
  viewStart: number,
  viewEnd: number,
): { left: string; width: string } | null {
  const leftMin = Math.max(startMin, viewStart);
  const rightMin = Math.min(endMin, viewEnd);
  if (rightMin - leftMin < 1) return null;
  const left = percent(leftMin, viewStart, viewEnd);
  const width = percent(rightMin, viewStart, viewEnd) - left;
  return { left: `${left}%`, width: `${width}%` };
}

export function Loom({ board, view, schedule, wait, now, onCut }: LoomProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; cut: number } | null>(null);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const columns = {
    gridTemplateColumns: `repeat(${view.hours.length}, minmax(0, 1fr))`,
  };
  const unread = ribbonNote(schedule, wait);

  const placeFromClick = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const minute =
      view.viewStartMin + ratio * (view.viewEndMin - view.viewStartMin) - board.durationMin / 2;
    onCut(minute);
  };

  const cutStartMin = axisMinutes(view.cutStartUtc, view.axis.zone, board.day);
  const nowMin = now === null ? null : axisMinutes(now, view.axis.zone, board.day);
  const cutEndMin = cutStartMin + board.durationMin;
  const cutStyle = bandStyle(cutStartMin, cutEndMin, view.viewStartMin, view.viewEndMin);
  const nowVisible =
    nowMin !== null && nowMin >= view.viewStartMin && nowMin <= view.viewEndMin;

  const hoverUtc =
    hoverMin === null ? null : utcFromAxisMinutes(hoverMin, view.axis.zone, board.day);

  return (
    <section aria-label="Day" className="min-w-0">
      <div className="panel overflow-hidden">
        <div className="flex min-w-0">
          <div className="w-28 shrink-0 border-r border-line sm:w-44">
            <div className={`${HEAD} border-b border-line`} />
            {board.places.map((place, index) => (
              <div
                key={place.zone}
                className={`${ROW} flex flex-col justify-center border-b border-line px-3`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-base font-medium leading-none">
                    {place.label}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {now === null ? "––:––" : formatHm(now, place.zone)}
                  </span>
                </div>
                <span className="truncate text-xs text-mute tabular-nums">
                  {now === null ? "\u00a0" : formatOffset(now, place.zone)}
                  {index === 0 ? " · axis" : ""}
                </span>
              </div>
            ))}
            <div className={`${RIBBON} flex items-center border-b border-line px-3 text-sm`}>
              Calendar
            </div>
            <div className={`${RIBBON} flex items-center px-3 text-sm`}>Zoom</div>
          </div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div
              ref={trackRef}
              className="relative"
              style={{ minWidth: view.hours.length * 56 }}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("[data-cut]")) return;
                placeFromClick(event.clientX);
              }}
              onPointerMove={(event) => {
                if (event.pointerType !== "mouse" || !trackRef.current) return;
                const rect = trackRef.current.getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                setHoverMin(
                  view.viewStartMin + ratio * (view.viewEndMin - view.viewStartMin),
                );
              }}
              onPointerLeave={() => setHoverMin(null)}
            >
              <div className={`${HEAD} grid border-b border-line`} style={columns}>
                {view.hours.map((minute) => (
                  <div
                    key={minute}
                    className="border-l border-line px-1 text-xs text-mute tabular-nums"
                  >
                    {pad2(Math.floor(minute / 60))}
                  </div>
                ))}
              </div>
              <div className="relative">
                {board.places.map((place) => (
                  <div
                    key={place.zone}
                    className={`${ROW} grid border-b border-line`}
                    style={columns}
                  >
                    {view.hours.map((minute) => {
                      const utc = utcFromAxisMinutes(minute + 30, view.axis.zone, board.day);
                      const local = partsInZone(utc, place.zone);
                      const working = inWork(place, utc, board.weekdaysOnly);
                      const night = local.hour < 7 || local.hour >= 21;
                      return (
                        <div
                          key={minute}
                          className={`flex items-start border-l border-line px-1 text-xs text-mute tabular-nums ${
                            working ? "cell-work" : night ? "cell-night" : ""
                          }`}
                        >
                          {pad2(local.hour)}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {view.sharedBands.map((band) => {
                  const style = bandStyle(
                    band.startMin,
                    band.endMin,
                    view.viewStartMin,
                    view.viewEndMin,
                  );
                  if (!style) return null;
                  return (
                    <div
                      key={`${band.startMin}-${band.endMin}`}
                      className="shared-band pointer-events-none absolute inset-y-0"
                      style={style}
                    />
                  );
                })}
              </div>
              <Ribbon
                empty={unread ?? (schedule?.status === "ok" ? "Nothing scheduled in view." : "No data")}
                showEmpty={
                  unread !== null ||
                  (view.timedEvents.filter((event) => !event.isZoom).length === 0 &&
                    (schedule?.busy.length ?? 0) === 0)
                }
              >
                {schedule?.status === "ok"
                  ? schedule.busy.map((span) => {
                      const style = spanStyle(
                        Date.parse(span.start),
                        Date.parse(span.end),
                        view.axis.zone,
                        board.day,
                        view.viewStartMin,
                        view.viewEndMin,
                      );
                      if (!style) return null;
                      return (
                        <div key={`${span.start}-${span.end}`} className="busy-fill absolute inset-y-1" style={style} />
                      );
                    })
                  : null}
                {view.timedEvents
                  .filter((event) => !event.isZoom)
                  .map((event) => {
                    const style = spanStyle(
                      Date.parse(event.start),
                      Date.parse(event.end),
                      view.axis.zone,
                      board.day,
                      view.viewStartMin,
                      view.viewEndMin,
                    );
                    if (!style) return null;
                    return (
                      <div
                        key={event.id}
                        className="event-fill absolute inset-y-1 overflow-hidden px-1 text-xs"
                        style={style}
                        title={event.title}
                      >
                        <span className="truncate">{event.title}</span>
                      </div>
                    );
                  })}
              </Ribbon>
              <Ribbon
                empty={unread ?? "No Zoom calls in view."}
                showEmpty={unread !== null || view.zoomInView.length === 0}
                last
              >
                {view.zoomInView.map((event) => {
                  const style = spanStyle(
                    Date.parse(event.start),
                    Date.parse(event.end),
                    view.axis.zone,
                    board.day,
                    view.viewStartMin,
                    view.viewEndMin,
                  );
                  if (!style) return null;
                  return (
                    <div
                      key={event.id}
                      className="zoom-fill absolute inset-y-1 overflow-hidden px-1 text-xs"
                      style={style}
                      title={event.title}
                    >
                      <span className="truncate">{event.title}</span>
                    </div>
                  );
                })}
              </Ribbon>
              {nowVisible ? (
                <div
                  className="now-line pointer-events-none absolute bottom-0 top-8 z-20"
                  style={{ left: `${percent(nowMin ?? 0, view.viewStartMin, view.viewEndMin)}%` }}
                  title="Now"
                />
              ) : null}
              {cutStyle ? (
                <div
                  data-cut
                  role="slider"
                  tabIndex={0}
                  aria-label="Meeting start"
                  aria-valuemin={0}
                  aria-valuemax={24 * 60 - board.durationMin}
                  aria-valuenow={board.cutMinutes}
                  aria-valuetext={`${formatHm(view.cutStartUtc, view.axis.zone)} to ${formatHm(view.cutEndUtc, view.axis.zone)}`}
                  className="cut-block absolute bottom-0 top-8 z-10"
                  style={cutStyle}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 60 : 15;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      onCut(board.cutMinutes - step);
                    } else if (event.key === "ArrowRight") {
                      event.preventDefault();
                      onCut(board.cutMinutes + step);
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      onCut(0);
                    } else if (event.key === "End") {
                      event.preventDefault();
                      onCut(24 * 60 - board.durationMin);
                    }
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { x: event.clientX, cut: board.cutMinutes };
                  }}
                  onPointerMove={(event) => {
                    if (!drag.current || !trackRef.current) return;
                    const width = trackRef.current.getBoundingClientRect().width;
                    if (width <= 0) return;
                    const delta =
                      ((event.clientX - drag.current.x) / width) *
                      (view.viewEndMin - view.viewStartMin);
                    onCut(drag.current.cut + delta);
                  }}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {cutStyle ? null : (
        <p className="mt-3 text-sm text-mute">
          The cut sits outside this span. Switch to the full day, or nudge it from the side panel.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-mute">
        <span className="inline-flex items-center gap-2">
          <span className="swatch work-swatch" aria-hidden />
          Work hours
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="swatch shared-swatch" aria-hidden />
          Shared
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="swatch busy-swatch" aria-hidden />
          Calendar busy
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="swatch zoom-swatch" aria-hidden />
          Zoom
        </span>
        {hoverUtc !== null ? (
          <span className="text-ink tabular-nums">
            Pointer ·{" "}
            {board.places
              .map((place) => `${place.label} ${formatHm(hoverUtc, place.zone)}`)
              .join(" · ")}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function Ribbon({
  empty,
  showEmpty,
  last,
  children,
}: {
  empty: string;
  showEmpty: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`${RIBBON} relative border-line ${last ? "" : "border-b"}`}>
      {children}
      {showEmpty ? (
        <p className="flex h-full items-center px-3 text-sm text-mute">{empty}</p>
      ) : null}
    </div>
  );
}
