import { useEffect, useRef, useState, type ReactNode } from "react";
import { selectionRange, resizeSelection, snapMinutes, type Board } from "@/lib/time/board";
import { cityByZone } from "@/lib/time/cities";
import type { Derived } from "@/lib/time/derive";
import { axisMinutes, inWork, utcFromAxisMinutes, type Place } from "@/lib/time/intersect";
import {
  formatHm,
  formatOffset,
  partsInZone,
  dayMinutes,
  nextOffsetChange,
  inputToMinutes,
  minutesToInput,
  todayInZone,
  formatLength,
} from "@/lib/time/zoned";

type LoomProps = {
  board: Board;
  view: Derived;
  now: number | null;
  onCut: (minutes: number) => void;
  onRange: (cutMinutes: number, durationMin: number) => void;
  onPlaces: (places: Place[]) => void;
  cityChooser: ReactNode;
};

const HEAD = "h-16";
const ROW = "h-24 sm:h-20";
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

export function Loom({ board, view, now, onCut, onRange, onPlaces, cityChooser }: LoomProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
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
    const left =
      ((cutStartMin - view.viewStartMin) / (view.viewEndMin - view.viewStartMin)) *
      track.scrollWidth;
    if (left < viewport.scrollLeft || left > viewport.scrollLeft + viewport.clientWidth - 80) {
      viewport.scrollLeft = Math.max(0, left - viewport.clientWidth / 2);
    }
  }, [board.day, view.axis.zone, board.span, cutStartMin, view.viewStartMin, view.viewEndMin]);
  const nowMin = now === null ? null : axisMinutes(now, view.axis.zone, board.day);
  const cutEndMin = cutStartMin + board.durationMin;
  const cutStyle = bandStyle(cutStartMin, cutEndMin, view.viewStartMin, view.viewEndMin);
  const nowVisible = nowMin !== null && nowMin >= view.viewStartMin && nowMin <= view.viewEndMin;

  const hoverUtc =
    hoverMin === null ? null : utcFromAxisMinutes(hoverMin, view.axis.zone, board.day);

  return (
    <section aria-label="Day" className="min-w-0">
      <div className="panel">
        <div className="flex min-w-0">
          <div className="w-32 shrink-0 border-r border-line sm:w-64">
            <div
              className={`${HEAD} city-chooser relative z-40 flex items-center border-b border-line px-2`}
            >
              {cityChooser}
            </div>
            {board.places.map((place, index) => (
              <div
                key={place.zone}
                className={`${ROW} city-row relative flex flex-col justify-center border-b border-line px-3`}
                draggable
                onDragStart={() => {
                  draggedCity.current = place.zone;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = board.places.findIndex(
                    (item) => item.zone === draggedCity.current,
                  );
                  if (source >= 0) moveCity(source, index - source);
                  draggedCity.current = null;
                }}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                  <span className="truncate text-base font-medium leading-none">{place.label}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {now === null ? "––:––" : formatHm(now, place.zone, board.clockFormat)}
                  </span>
                </div>
                <span className="truncate text-xs text-mute">
                  {cityByZone(place.zone)?.region ?? place.zone.split("/")[0]}
                </span>
                <span className="truncate text-xs text-mute tabular-nums">
                  {now === null ? "" : todayInZone(place.zone, now)}
                  {board.showTimezone && now !== null ? ` · ${formatOffset(now, place.zone)}` : ""}
                </span>
                <details
                  className="city-row-menu absolute bottom-0 right-1 z-30 text-xs"
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
                    className="press cursor-pointer px-2"
                    aria-label={`Options for ${place.label}`}
                  >
                    •••
                  </summary>
                  <div className="glass-menu panel absolute left-0 top-full w-60 p-3 shadow-lg">
                    <button
                      type="button"
                      className="press min-h-11 w-full text-left"
                      disabled={index === 0}
                      aria-label={`Use ${place.label} as reference city`}
                      onClick={() =>
                        onPlaces([
                          place,
                          ...board.places.filter((item) => item.zone !== place.zone),
                        ])
                      }
                    >
                      Use as reference city
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="press min-h-11"
                        disabled={index === 0}
                        aria-label={`Move ${place.label} earlier`}
                        onClick={() => moveCity(index, -1)}
                      >
                        ↑ Earlier
                      </button>
                      <button
                        type="button"
                        className="press min-h-11"
                        disabled={index === board.places.length - 1}
                        aria-label={`Move ${place.label} later`}
                        onClick={() => moveCity(index, 1)}
                      >
                        ↓ Later
                      </button>
                    </div>
                    <label>
                      Rename{" "}
                      <input
                        aria-label={`Rename ${place.label}`}
                        className="h-11 w-full border border-line bg-canvas px-2"
                        maxLength={79}
                        value={place.label}
                        onChange={(event) => {
                          if (event.target.value.trim())
                            onPlaces(
                              board.places.map((item) =>
                                item.zone === place.zone
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            );
                        }}
                      />
                    </label>
                    <details className="mt-2">
                      <summary className="cursor-pointer">Work hours</summary>
                      {(["workStart", "workEnd"] as const).map((key) => (
                        <label key={key} className="mt-2 block">
                          {key === "workStart" ? "Work starts" : "Work ends"}
                          <input
                            type="time"
                            aria-label={`${place.label} ${key === "workStart" ? "work starts" : "work ends"}`}
                            className="h-11 w-full border border-line bg-canvas"
                            value={minutesToInput(place[key])}
                            onChange={(event) => {
                              const value = inputToMinutes(event.target.value);
                              if (value !== null)
                                onPlaces(
                                  board.places.map((item) =>
                                    item.zone === place.zone
                                      ? {
                                          ...item,
                                          [key]: key === "workEnd" && value === 0 ? 1440 : value,
                                        }
                                      : item,
                                  ),
                                );
                            }}
                          />
                        </label>
                      ))}
                    </details>
                    <p className="mt-2 text-mute">{place.zone}</p>
                    {(() => {
                      const change = nextOffsetChange(view.cutStartUtc, place.zone);
                      return change ? (
                        <p className="mt-2 text-warn">
                          Offset changes {new Date(change.at).toISOString().slice(0, 10)}:{" "}
                          {change.before} → {change.after}
                        </p>
                      ) : (
                        <p className="mt-2 text-mute">No offset change in the next 7 days.</p>
                      );
                    })()}
                    <button
                      type="button"
                      className="press min-h-11"
                      aria-label={`Remove ${place.label}`}
                      disabled={board.places.length < 2}
                      onClick={() =>
                        onPlaces(board.places.filter((item) => item.zone !== place.zone))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </details>
              </div>
            ))}
          </div>
          <div ref={viewportRef} className="min-w-0 flex-1 overflow-x-auto">
            <div
              ref={trackRef}
              data-testid="time-track"
              className="relative touch-none"
              style={{ minWidth: view.hours.length * 56 }}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("[data-cut]")) return;
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
                setHoverMin(pointerMinute(event.clientX));
                applyDrag(event.clientX, event.shiftKey);
              }}
              onPointerUp={(event) => {
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
                drag.current = null;
              }}
              onPointerLeave={() => setHoverMin(null)}
            >
              <div className={`${HEAD} grid border-b border-line`} style={columns}>
                {view.hours.map((minute) => (
                  <div
                    key={minute}
                    className="border-l border-line px-1 text-xs text-mute tabular-nums"
                  >
                    {formatHm(
                      utcFromAxisMinutes(minute, view.axis.zone, board.day),
                      view.axis.zone,
                      board.clockFormat,
                    )}
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
                      const utc = utcFromAxisMinutes(minute, view.axis.zone, board.day);
                      const local = partsInZone(utc, place.zone);
                      const working = inWork(place, utc, board.weekdaysOnly);
                      const night = local.hour < 7 || local.hour >= 21;
                      return (
                        <div
                          key={minute}
                          title={`${todayInZone(place.zone, utc)} ${formatHm(utc, place.zone, board.clockFormat)}`}
                          className={`flex flex-col items-start justify-center border-l border-line px-1 text-sm text-mute tabular-nums ${
                            working ? "cell-work" : night ? "cell-night" : ""
                          } ${
                            board.markWeekends && (local.weekday === 0 || local.weekday === 6)
                              ? "bg-warn/10"
                              : ""
                          }`}
                        >
                          <span>
                            {formatHm(utc, place.zone, board.clockFormat).replace(":00", "")}
                          </span>
                          {local.hour === 0 || minute === view.viewStartMin ? (
                            <span className="mt-1 text-[10px]">
                              {todayInZone(place.zone, utc).slice(5)}
                            </span>
                          ) : null}
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
                  aria-valuemax={length - 5}
                  aria-valuenow={board.cutMinutes}
                  aria-valuetext={`${formatHm(view.cutStartUtc, view.axis.zone, board.clockFormat)} to ${formatHm(view.cutEndUtc, view.axis.zone, board.clockFormat)}`}
                  className="cut-block absolute bottom-0 top-8 z-10 touch-none"
                  style={cutStyle}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 5 : 15;
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
                      onCut(length - board.durationMin);
                    }
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const edge = (event.target as HTMLElement).dataset.edge;
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
                  <span className="pointer-events-none absolute left-1 top-1 whitespace-nowrap rounded-sm bg-accent px-2 py-1 text-xs text-canvas">
                    {formatHm(view.cutStartUtc, view.axis.zone, board.clockFormat)} ·{" "}
                    {formatLength(board.durationMin * 60_000)}
                  </span>
                  {(["start", "end"] as const).map((edge) => (
                    <button
                      key={edge}
                      type="button"
                      data-edge={edge}
                      aria-label={`Resize meeting ${edge}`}
                      className={`absolute inset-y-0 w-6 cursor-ew-resize bg-accent/20 ${edge === "start" ? "left-0 -translate-x-full" : "right-0 translate-x-full"}`}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.stopPropagation();
                        event.preventDefault();
                        const delta =
                          (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 5 : 15);
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
        {hoverUtc !== null ? (
          <span className="text-ink tabular-nums">
            Pointer ·{" "}
            {board.places
              .map((place) => `${place.label} ${formatHm(hoverUtc, place.zone, board.clockFormat)}`)
              .join(" · ")}
          </span>
        ) : null}
      </div>
    </section>
  );
}
