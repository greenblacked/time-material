import type { BusySpan, ScheduleEvent } from "./types";

const ZOOM_URL = /https?:\/\/(?:[\w-]+\.)?zoom\.us\/(?:j|my|s|w|wc)\/[^\s<>"')]+/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toIso(value: string): string | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function readZoomUrl(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") {
    const match = value.match(ZOOM_URL);
    return match ? match[0].replace(/[.,;]+$/, "") : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readZoomUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const nested of Object.values(record)) {
    const found = readZoomUrl(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function conferenceIsZoom(record: Record<string, unknown>): boolean {
  const data = asRecord(record.conferenceData);
  const solution = data ? asRecord(data.conferenceSolution) : null;
  const name = solution && typeof solution.name === "string" ? solution.name : "";
  return /zoom/i.test(name);
}

function readEventTime(value: unknown): { iso: string; allDay: boolean } | null {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { iso: value, allDay: true };
    const iso = toIso(value);
    return iso ? { iso, allDay: false } : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.dateTime === "string") {
    const iso = toIso(record.dateTime);
    return iso ? { iso, allDay: false } : null;
  }
  if (typeof record.date === "string") return { iso: record.date, allDay: true };
  return null;
}

function readEvent(value: unknown): ScheduleEvent | null {
  const record = asRecord(value);
  if (!record) return null;
  const hasIdentity =
    typeof record.summary === "string" ||
    typeof record.title === "string" ||
    typeof record.subject === "string" ||
    record.conferenceData != null ||
    typeof record.htmlLink === "string" ||
    typeof record.hangoutLink === "string";
  if (!hasIdentity) return null;
  const start = readEventTime(record.start);
  const end = readEventTime(record.end);
  if (!start || !end) return null;
  const rawTitle =
    (typeof record.summary === "string" && record.summary) ||
    (typeof record.title === "string" && record.title) ||
    (typeof record.subject === "string" && record.subject) ||
    "Untitled";
  const title = rawTitle.trim().slice(0, 140) || "Untitled";
  const zoomUrl = readZoomUrl(record);
  const isZoom = Boolean(zoomUrl) || conferenceIsZoom(record);
  const status = typeof record.status === "string" ? record.status : "";
  const transparent = record.transparency === "transparent" || status === "cancelled";
  const id =
    typeof record.id === "string" && record.id
      ? record.id
      : `${start.iso}:${title}`;
  return {
    id,
    title,
    start: start.iso,
    end: end.iso,
    zoomUrl,
    isZoom,
    allDay: start.allDay || end.allDay,
    blocksTime: !start.allDay && !end.allDay && !transparent && status !== "cancelled",
  };
}

export function collectEvents(data: unknown): ScheduleEvent[] {
  const found: ScheduleEvent[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 7 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        const event = readEvent(item);
        if (event) found.push(event);
        else visit(item, depth + 1);
      }
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    const event = readEvent(record);
    if (event) found.push(event);
    for (const key of ["items", "events", "data", "result"]) {
      if (key in record) visit(record[key], depth + 1);
    }
  };
  visit(data, 0);
  const seen = new Set<string>();
  const unique: ScheduleEvent[] = [];
  for (const event of found) {
    const key = `${event.id}:${event.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
    if (unique.length >= 80) break;
  }
  return unique;
}

function readBusy(value: unknown): BusySpan | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.start !== "string" || typeof record.end !== "string") return null;
  const start = toIso(record.start);
  const end = toIso(record.end);
  if (!start || !end || Date.parse(end) <= Date.parse(start)) return null;
  return { start, end };
}

export function collectBusy(data: unknown): BusySpan[] {
  const out: BusySpan[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    if (Array.isArray(record.busy)) {
      for (const item of record.busy) {
        const span = readBusy(item);
        if (span) out.push(span);
      }
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  };
  visit(data, 0);
  return out.slice(0, 200);
}

export function zoomLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "zoom.us" && !host.endsWith(".zoom.us")) return "Zoom link";
  } catch {
    return "Zoom link";
  }
  const match = url.match(/\/j\/(\d+)/);
  return match ? `Zoom ${match[1]}` : "Open Zoom";
}
