import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, TimeSelect } from "./ui";
import { ArrowDown, ArrowUp, MoreHorizontal, Star, Trash2 } from "lucide-react";
import {
  placeIdentity,
  selectionRange,
  resizeSelection,
  snapMinutes,
  type Board,
} from "@/lib/time/board";
import { cityByZone } from "@/lib/time/cities";
import type { Derived } from "@/lib/time/derive";
import { axisMinutes, inWork, utcFromAxisMinutes, type Place } from "@/lib/time/intersect";
import {
  formatHm,
  formatOffset,
  partsInZone,
  dayMinutes,
  nextOffsetChange,
  todayInZone,
  formatLength,
  dayKey,
} from "@/lib/time/zoned";

type LoomProps = {
  board: Board;
  view: Derived;
  now: number | null;
  onCut: (minutes: number) => void;
  onRange: (cutMinutes: number, durationMin: number) => void;
  onPlaces: (places: Place[]) => void;
  onRemove: (place: Place) => void;
  onSpan: (span: Board["span"]) => void;
  cityChooser: ReactNode;
};

const HEAD = "h-12";
const ROW = "h-16";
/** "1h", "1h 30m", "45m": fits a one-hour column. */
function compactLength(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function percent(minute: number, start: number, end: number): number {
  return ((minute - start) / (end - start)) * 100;
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

/** Rename keeps an empty draft locally, so the field can be cleared and retyped. */
function RenameField({ place, onRename }: { place: Place; onRename: (label: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="field-label">
      Name
      <input
        aria-label={`Rename ${place.label}`}
        className="field w-full"
        maxLength={400}
        value={draft ?? place.label}
        onChange={(event) => {
          setDraft(event.target.value);
          if (event.target.value.trim()) onRename(event.target.value);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter") setDraft(null);
        }}
      />
    </label>
  );
}

export function Loom({
  board,
  view,
  now,
  onCut,
  onRange,
  onPlaces,
  onRemove,
  onSpan,
  cityChooser,
}: LoomProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const touchTap = useRef<{
    pointerId: number;
    x: number;
    y: number;
    minute: number;
    scrollLeft: number;
  } | null>(null);
  const tappedCut = useRef<number | null>(null);
  const drag = useRef<{
    anchor: number;
    pointerX: number;
    moved: boolean;
    cut: number;
    duration: number;
    mode: "draw" | "move" | "start" | "end";
  } | null>(null);
  const draggedCity = useRef<string | null>(null);
  const length = dayMinutes(board.day, view.axis.zone);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const columns = {
    gridTemplateColumns: `repeat(${view.hours.length}, minmax(0, 1fr))`,
  };

  const pointerMinute = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return view.viewStartMin;
    return (
      view.viewStartMin +
      Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) *
        (view.viewEndMin - view.viewStartMin)
    );
  };
  const resizeRange = (
    edge: "start" | "end",
    minute: number,
    cut: number,
    duration: number,
    step: number,
  ) => {
    const range = resizeSelection(edge, minute, cut, duration, length, step);
    onRange(range.cutMinutes, range.durationMin);
  };
  const applyDrag = (clientX: number, shift: boolean) => {
    const current = drag.current;
    if (!current) return;
    const step = shift ? 5 : 15;
    const minute = pointerMinute(clientX);
    if (Math.abs(clientX - current.pointerX) >= 4) current.moved = true;
    if (!current.moved) return;
    if (current.mode === "move")
      onCut(
        Math.max(
          0,
          Math.min(
            length - current.duration,
            snapMinutes(current.cut + minute - current.anchor, step),
          ),
        ),
      );
    else if (current.mode === "start" || current.mode === "end") {
      resizeRange(
        current.mode,
        (current.mode === "start" ? current.cut : current.cut + current.duration) +
          minute -
          current.anchor,
        current.cut,
        current.duration,
        step,
      );
    } else {
      const range = selectionRange(current.anchor, minute, length, step);
      onRange(range.cutMinutes, range.durationMin);
    }
  };
  const moveCity = (index: number, delta: number) => {
    const places = [...board.places];
    const target = index + delta;
    if (target < 0 || target >= places.length) return;
    const [item] = places.splice(index, 1);
    if (item) places.splice(target, 0, item);
    onPlaces(places);
  };

  const cutStartMin = axisMinutes(view.cutStartUtc, view.axis.zone, board.day);
  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || drag.current) return;
    const preserveViewport = tappedCut.current === board.cutMinutes;
    tappedCut.current = null;
    if (preserveViewport) return;
    const left =
      ((cutStartMin - view.viewStartMin) / (view.viewEndMin - view.viewStartMin)) *
      track.scrollWidth;
    if (left < viewport.scrollLeft || left > viewport.scrollLeft + viewport.clientWidth - 80) {
      // Land on a whole hour column so no clipped label sits against the city column.
      const column = track.scrollWidth / Math.max(1, view.hours.length);
      viewport.scrollLeft = Math.max(
        0,
        Math.round((left - viewport.clientWidth / 2) / column) * column,
      );
    }
  }, [
    board.day,
    board.cutMinutes,
    view.axis.zone,
    board.span,
    cutStartMin,
    view.viewStartMin,
    view.viewEndMin,
    view.hours.length,
  ]);
  const nowMin = now === null ? null : axisMinutes(now, view.axis.zone, board.day);
  const cutEndMin = cutStartMin + board.durationMin;
  const cutStyle = bandStyle(cutStartMin, cutEndMin, view.viewStartMin, view.viewEndMin);
  const nowVisible = nowMin !== null && nowMin >= view.viewStartMin && nowMin <= view.viewEndMin;

  const hoverUtc =
    hoverMin === null ? null : utcFromAxisMinutes(hoverMin, view.axis.zone, board.day);

  const updatePlace = (place: Place, patch: Partial<Place>) =>
    onPlaces(
      board.places.map((item) =>
        placeIdentity(item) === placeIdentity(place) ? { ...item, ...patch } : item,
      ),
    );
  const referenceDay = now === null ? null : todayInZone(view.axis.zone, now);
  const fmt = (utc: number, zone: string) => formatHm(utc, zone, board.clockFormat);
  const valueText = [
    `${fmt(view.cutStartUtc, view.axis.zone)} to ${fmt(view.cutEndUtc, view.axis.zone)} ${view.axis.label}`,
    ...view.readouts
      .filter((row) => !row.axis)
      .map(
        (row) =>
          `${row.place.label} ${row.localStart} to ${row.localEnd}${row.inWork ? "" : ", outside work hours"}`,
      ),
  ].join("; ");
  const moveBy = (delta: number) =>
    onCut(Math.max(0, Math.min(length - board.durationMin, board.cutMinutes + delta)));
  const readout =
    hoverUtc !== null
      ? {
          label: "Pointer",
          items: board.places.map((place) => `${place.label} ${fmt(hoverUtc, place.zone)}`),
        }
      : {
          label: "Selected",
          items: view.readouts.map((row) => `${row.place.label} ${row.localStart}`),
        };

  return (
    <section aria-labelledby="timeline-heading" className="min-w-0">
      <h2 id="timeline-heading" className="sr-only">
        Timeline
      </h2>
      <div className="panel">
        <div className="flex min-w-0">
          <div className="w-36 shrink-0 border-r border-line md:w-56">
            <div className={`${HEAD} city-chooser relative z-40 flex border-b border-line`}>
              {cityChooser}
            </div>
            {board.places.map((place, index) => {
              const localDay = now === null ? null : todayInZone(place.zone, now);
              const dayDelta =
                localDay && referenceDay && localDay !== referenceDay
                  ? localDay > referenceDay
                    ? 1
                    : -1
                  : 0;
              const change = nextOffsetChange(view.cutStartUtc, place.zone);
              return (
                <div
                  key={place.cityId ?? place.zone}
                  className={`${ROW} city-row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 border-b border-line pl-3 pr-1 last:border-b-0`}
                  draggable
                  onDragStart={() => {
                    draggedCity.current = placeIdentity(place);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const source = board.places.findIndex(
                      (item) => placeIdentity(item) === draggedCity.current,
                    );
                    if (source >= 0) moveCity(source, index - source);
                    draggedCity.current = null;
                  }}
                >
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-sm font-medium">{place.label}</span>
                      {index === 0 ? (
                        <Star
                          role="img"
                          aria-label="Reference city"
                          className="size-3 shrink-0 self-center fill-current text-mute"
                        />
                      ) : null}
                      <span className="hidden min-w-0 truncate text-xs text-mute md:inline">
                        {place.region ?? cityByZone(place.zone)?.region ?? place.zone.split("/")[0]}
                      </span>
                    </p>
                    <p className="flex min-w-0 items-center gap-1.5 text-xs text-mute tabular-nums">
                      <span className="shrink-0 text-ink">
                        {now === null ? "––:––" : fmt(now, place.zone)}
                      </span>
                      {dayDelta !== 0 ? (
                        <span
                          className="shrink-0 rounded-sm bg-inset px-1 font-medium text-ink"
                          title={dayDelta > 0 ? "Next day" : "Previous day"}
                        >
                          {dayDelta > 0 ? "+1" : "−1"}
                          <span className="sr-only"> day</span>
                        </span>
                      ) : null}
                      {board.showTimezone && now !== null ? (
                        <span className="truncate">{formatOffset(now, place.zone)}</span>
                      ) : null}
                    </p>
                  </div>
                  <details
                    className="city-row-menu"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.currentTarget.open = false;
                        event.currentTarget.querySelector("summary")?.focus();
                      }
                    }}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget))
                        event.currentTarget.open = false;
                    }}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button"))
                        event.currentTarget.open = false;
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <summary
                      className="icon-btn btn-ghost size-8 text-mute pointer-coarse:size-11"
                      aria-label={`Options for ${place.label}`}
                      title={`Options for ${place.label}`}
                    >
                      <MoreHorizontal aria-hidden className="size-4" />
                    </summary>
                    <div className="glass-menu absolute left-2 top-[calc(100%-0.25rem)] w-[min(18rem,calc(100vw-2rem))] p-1">
                      <div className="px-3 py-2">
                        <p className="truncate text-sm font-medium">{place.label}</p>
                        <p className="truncate text-xs text-mute">
                          {place.zone}
                          {now === null ? "" : ` · ${formatOffset(now, place.zone)}`}
                        </p>
                      </div>
                      <div className="divider" />
                      <button
                        type="button"
                        className="menu-item"
                        disabled={index === 0}
                        aria-label={`Use ${place.label} as reference city`}
                        onClick={() =>
                          onPlaces([
                            place,
                            ...board.places.filter(
                              (item) => placeIdentity(item) !== placeIdentity(place),
                            ),
                          ])
                        }
                      >
                        <Star aria-hidden className="size-4 text-mute" />
                        Use as reference city
                      </button>
                      <button
                        type="button"
                        className="menu-item"
                        disabled={index === 0}
                        aria-label={`Move ${place.label} up`}
                        onClick={() => moveCity(index, -1)}
                      >
                        <ArrowUp aria-hidden className="size-4 text-mute" />
                        Move up
                      </button>
                      <button
                        type="button"
                        className="menu-item"
                        disabled={index === board.places.length - 1}
                        aria-label={`Move ${place.label} down`}
                        onClick={() => moveCity(index, 1)}
                      >
                        <ArrowDown aria-hidden className="size-4 text-mute" />
                        Move down
                      </button>
                      <div className="divider" />
                      <div className="grid gap-3 px-3 py-2">
                        <RenameField
                          place={place}
                          onRename={(label) => updatePlace(place, { label })}
                        />
                        <fieldset className="grid grid-cols-2 gap-2">
                          <legend className="field-label mb-1">Work hours</legend>
                          {(["workStart", "workEnd"] as const).map((key) => (
                            <label key={key} className="field-label">
                              {key === "workStart" ? "Starts" : "Ends"}
                              <TimeSelect
                                label={`${place.label} ${key === "workStart" ? "work starts" : "work ends"}`}
                                className="w-full px-2"
                                format={board.clockFormat}
                                zone={place.zone}
                                value={place[key]}
                                from={key === "workStart" ? 0 : 15}
                                to={key === "workStart" ? 1425 : 1440}
                                onChange={(value) => updatePlace(place, { [key]: value })}
                              />
                            </label>
                          ))}
                        </fieldset>
                        {change ? (
                          <p className="text-xs text-warn">
                            Offset changes {new Date(change.at).toISOString().slice(0, 10)}:{" "}
                            {change.before} → {change.after}
                          </p>
                        ) : (
                          <p className="text-xs text-mute">No offset change in the next 7 days.</p>
                        )}
                      </div>
                      <div className="divider" />
                      <button
                        type="button"
                        className="menu-item menu-item-danger"
                        aria-label={`Remove ${place.label}`}
                        disabled={board.places.length < 2}
                        onClick={() => onRemove(place)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                        Remove
                      </button>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
          <div
            ref={viewportRef}
            className="timeline-viewport min-w-0 flex-1 overflow-x-auto"
            onScroll={(event) => {
              // Fade the clipped first column against the city column once scrolled.
              event.currentTarget.toggleAttribute(
                "data-scrolled",
                event.currentTarget.scrollLeft > 1,
              );
            }}
          >
            <div
              ref={trackRef}
              data-testid="time-track"
              className="timeline-track relative"
              style={{ minWidth: view.hours.length * 56 }}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("[data-cut]")) return;
                if (!event.isPrimary || event.button !== 0) return;
                if (event.pointerType === "touch") {
                  touchTap.current = {
                    pointerId: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    minute: pointerMinute(event.clientX),
                    scrollLeft: viewportRef.current?.scrollLeft ?? 0,
                  };
                  return;
                }
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  anchor: pointerMinute(event.clientX),
                  pointerX: event.clientX,
                  moved: false,
                  cut: board.cutMinutes,
                  duration: board.durationMin,
                  mode: "draw",
                };
              }}
              onPointerMove={(event) => {
                if (event.pointerType === "touch") {
                  const tap = touchTap.current;
                  if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8)
                    touchTap.current = null;
                  return;
                }
                setHoverMin(pointerMinute(event.clientX));
                applyDrag(event.clientX, event.shiftKey);
              }}
              onPointerUp={(event) => {
                if (event.pointerType === "touch") {
                  const tap = touchTap.current;
                  touchTap.current = null;
                  if (
                    tap?.pointerId === event.pointerId &&
                    Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 8 &&
                    Math.abs((viewportRef.current?.scrollLeft ?? 0) - tap.scrollLeft) <= 1
                  ) {
                    const cut = Math.max(
                      0,
                      Math.min(length - board.durationMin, snapMinutes(tap.minute, 15)),
                    );
                    tappedCut.current = cut;
                    onCut(cut);
                  }
                  return;
                }
                if (drag.current?.mode === "draw") {
                  if (drag.current.moved) applyDrag(event.clientX, event.shiftKey);
                  else
                    onCut(
                      Math.max(
                        0,
                        Math.min(
                          length - drag.current.duration,
                          snapMinutes(pointerMinute(event.clientX), event.shiftKey ? 5 : 15),
                        ),
                      ),
                    );
                }
                drag.current = null;
              }}
              onPointerCancel={() => {
                touchTap.current = null;
                drag.current = null;
              }}
              onPointerLeave={() => setHoverMin(null)}
            >
              <div className={`${HEAD} grid border-b border-line`} style={columns}>
                {view.hours.map((minute) => (
                  <div
                    key={minute}
                    className="hour-head flex items-end border-l border-line px-1.5 pb-1.5 text-xs text-mute tabular-nums first:border-l-0"
                  >
                    {fmt(utcFromAxisMinutes(minute, view.axis.zone, board.day), view.axis.zone)}
                  </div>
                ))}
              </div>
              <div className="relative">
                {board.places.map((place) => {
                  const dateLabel = new Intl.DateTimeFormat("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    timeZone: place.zone,
                  });
                  const weekdayLabel = new Intl.DateTimeFormat("en-GB", {
                    weekday: "short",
                    timeZone: place.zone,
                  });
                  return (
                    <div
                      key={place.cityId ?? place.zone}
                      className={`${ROW} grid border-b border-line last:border-b-0`}
                      style={columns}
                    >
                      {view.hours.map((minute) => {
                        const utc = utcFromAxisMinutes(minute, view.axis.zone, board.day);
                        const local = partsInZone(utc, place.zone);
                        const working = inWork(place, utc, board.weekdaysOnly);
                        const weekend =
                          board.markWeekends && (local.weekday === 0 || local.weekday === 6);
                        const localDay = dayKey(local.year, local.month, local.day);
                        // Muted text drops below 4.5:1 under the selection tint, so lift it to ink.
                        const underCut =
                          minute + 60 > board.cutMinutes &&
                          minute < board.cutMinutes + board.durationMin;
                        // Mark each local midnight, and the first column when the city is on another date.
                        const showDay =
                          local.hour === 0 ||
                          (minute === view.viewStartMin && localDay !== board.day);
                        return (
                          <div
                            key={minute}
                            title={`${place.label} · ${dateLabel.format(utc)}, ${fmt(utc, place.zone)}`}
                            className={`hour-cell flex flex-col items-start justify-center gap-1 border-l border-line px-1.5 text-sm tabular-nums first:border-l-0 ${
                              working
                                ? "cell-work font-medium"
                                : underCut
                                  ? "text-ink"
                                  : "text-mute"
                            } ${weekend ? "bg-warn/10" : ""}`}
                          >
                            <span>{fmt(utc, place.zone).replace(":00", "")}</span>
                            {showDay ? (
                              <span className="rounded-sm bg-surface px-1 text-xs font-medium text-ink ring-1 ring-line">
                                {weekdayLabel.format(utc)}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
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
              {nowVisible ? (
                <div
                  className="now-line pointer-events-none absolute bottom-0 top-12 z-20"
                  style={{ left: `${percent(nowMin ?? 0, view.viewStartMin, view.viewEndMin)}%` }}
                  aria-hidden
                />
              ) : null}
              {cutStyle ? (
                <div
                  data-cut
                  className="absolute inset-y-0 z-10 touch-none"
                  style={cutStyle}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (!event.isPrimary || event.button !== 0) return;
                    event.preventDefault();
                    touchTap.current = null;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const edge = (event.target as HTMLElement).closest<HTMLElement>("[data-edge]")
                      ?.dataset.edge;
                    drag.current = {
                      anchor: pointerMinute(event.clientX),
                      pointerX: event.clientX,
                      moved: false,
                      cut: board.cutMinutes,
                      duration: board.durationMin,
                      mode: edge === "start" || edge === "end" ? edge : "move",
                    };
                  }}
                  onPointerMove={(event) => {
                    event.stopPropagation();
                    if (drag.current) event.preventDefault();
                    applyDrag(event.clientX, event.shiftKey);
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                >
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Meeting start"
                    aria-valuemin={0}
                    aria-valuemax={length - board.durationMin}
                    aria-valuenow={board.cutMinutes}
                    aria-valuetext={valueText}
                    className="cut-block absolute inset-0 cursor-grab active:cursor-grabbing"
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 5 : 15;
                      const moves: Record<string, number> = {
                        ArrowLeft: -step,
                        ArrowDown: -step,
                        ArrowRight: step,
                        ArrowUp: step,
                        PageDown: -60,
                        PageUp: 60,
                      };
                      if (event.key in moves) {
                        event.preventDefault();
                        moveBy(moves[event.key] ?? 0);
                      } else if (event.key === "Home") {
                        event.preventDefault();
                        onCut(0);
                      } else if (event.key === "End") {
                        event.preventDefault();
                        onCut(length - board.durationMin);
                      }
                    }}
                  >
                    {/* Sits in the header band above the hour labels and never leaves the block. */}
                    <span className="cut-badge pointer-events-none absolute left-1 top-1 max-w-[calc(100%-0.5rem)] truncate rounded-sm bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-fg tabular-nums">
                      <span className="cut-badge-full">
                        {fmt(view.cutStartUtc, view.axis.zone)} ·{" "}
                        {formatLength(board.durationMin * 60_000)}
                      </span>
                      <span className="cut-badge-short">{compactLength(board.durationMin)}</span>
                    </span>
                  </div>
                  {(["start", "end"] as const).map((edge) => (
                    <button
                      key={edge}
                      type="button"
                      data-edge={edge}
                      aria-label={`Resize meeting ${edge}`}
                      title={`Drag to change the meeting ${edge}`}
                      className={`cut-edge absolute inset-y-0 w-8 cursor-ew-resize pointer-coarse:w-11 ${edge === "start" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`}
                      onKeyDown={(event) => {
                        const sign =
                          event.key === "ArrowLeft" || event.key === "ArrowDown"
                            ? -1
                            : event.key === "ArrowRight" || event.key === "ArrowUp"
                              ? 1
                              : 0;
                        if (!sign) return;
                        event.stopPropagation();
                        event.preventDefault();
                        const delta = sign * (event.shiftKey ? 5 : 15);
                        resizeRange(
                          edge,
                          (edge === "start" ? cutStartMin : cutEndMin) + delta,
                          cutStartMin,
                          board.durationMin,
                          5,
                        );
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {cutStyle ? null : (
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-sm">
            <span className="text-mute">
              Your selected time ({fmt(view.cutStartUtc, view.axis.zone)}) is outside the work-hours
              view.
            </span>
            <Button variant="quiet" onClick={() => onSpan("day")}>
              Show full day
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 text-xs text-mute">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-2">
              <span className="swatch work-swatch" aria-hidden />
              Work hours
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="swatch shared-swatch" aria-hidden />
              Shared
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="swatch selected-swatch" aria-hidden />
              Selected
            </span>
            {nowVisible ? (
              <span className="inline-flex items-center gap-2">
                <span className="now-swatch" aria-hidden />
                Now
              </span>
            ) : null}
            <span className="pointer-coarse:hidden md:ml-auto">
              Drag across the grid to select a time · Shift for 5-minute steps
            </span>
            <span className="hidden pointer-coarse:inline md:ml-auto">
              Tap a time, then drag the edges to resize
            </span>
          </div>
          <p className="min-w-0 truncate tabular-nums" aria-hidden>
            <span className="font-medium text-ink">{readout.label}</span> ·{" "}
            {readout.items.join(" · ")}
          </p>
        </div>
      </div>
    </section>
  );
}
