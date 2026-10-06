import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import "./board-calendar.css";

function parseDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : undefined;
}

// DayPicker's default day button focuses without preventScroll. Keep the board
// position stable when a selected day or keyboard navigation receives focus.
function CalendarDayButton({ day: _day, modifiers, ...props }: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus({ preventScroll: true });
  }, [modifiers.focused]);
  return <button {...props} ref={ref} />;
}

export function BoardCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState({ source: value, draft: value });
  const trigger = useRef<HTMLButtonElement>(null);
  if (input.source !== value) setInput({ source: value, draft: value });
  const selected = parseDate(value);
  const invalid = input.draft !== "" && !parseDate(input.draft);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className="board-calendar-field">
          <input
            type="text"
            aria-label="Board date"
            aria-invalid={invalid || undefined}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            value={input.draft}
            onChange={(event) => {
              const next = event.target.value;
              setInput({ source: value, draft: next });
              if (parseDate(next)) onChange(next);
            }}
            onBlur={() => setInput({ source: value, draft: value })}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
              }
              if (event.key === "Escape") setInput({ source: value, draft: value });
            }}
          />
          <Popover.Trigger asChild>
            <button
              ref={trigger}
              type="button"
              className="board-calendar-trigger"
              aria-label="Open calendar"
            >
              <CalendarDays size={16} aria-hidden="true" />
            </button>
          </Popover.Trigger>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="board-calendar-popover"
          aria-label="Choose date"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
        >
          <div className="board-calendar-eyebrow">Pick a date</div>
          <DayPicker
            mode="single"
            required
            timeZone="UTC"
            selected={selected}
            defaultMonth={selected}
            autoFocus
            weekStartsOn={1}
            showOutsideDays
            fixedWeeks
            navLayout="around"
            components={{ DayButton: CalendarDayButton }}
            onSelect={(date) => {
              if (date) onChange(date.toISOString().slice(0, 10));
              setOpen(false);
            }}
          />
          <div className="board-calendar-hint">Use arrow keys to explore · Enter to select</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
