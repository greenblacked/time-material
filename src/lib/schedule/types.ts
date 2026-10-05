export type ScheduleStatus = "ok" | "pending" | "login" | "not_connected" | "unavailable";

export type BusySpan = {
  start: string;
  end: string;
};

export type ScheduleEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  zoomUrl: string | null;
  isZoom: boolean;
  allDay: boolean;
  blocksTime: boolean;
};

export type ScheduleResponse = {
  status: ScheduleStatus;
  message: string;
  loginUrl?: string;
  busyComplete?: boolean;
  eventsComplete?: boolean;
  busy: BusySpan[];
  events: ScheduleEvent[];
};
