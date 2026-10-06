import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatClockMinutes, type ClockFormat } from "@/lib/time/zoned";
import { VARIANT_CLASS, buttonClass, type ButtonVariant } from "./button-class";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export function Button({
  variant = "quiet",
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, className)} {...props}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  variant = "quiet",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("icon-btn", VARIANT_CLASS[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
}

type SegmentedOption<T extends string | number> = { value: T; label: ReactNode; title?: string };

/** One segmented control for every single-choice row (span, duration). */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("seg", className)}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          title={option.title}
          className="seg-item"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A clock-time picker that follows the board's time format. Native time inputs
 * use the browser locale instead, so a 24-hour board could show "05:00 PM".
 */
export function TimeSelect({
  label,
  value,
  onChange,
  format,
  zone,
  step = 15,
  from = 0,
  to = 1440 - step,
  className,
}: {
  label: string;
  /** Minutes from local midnight. */
  value: number;
  onChange: (minutes: number) => void;
  format: ClockFormat;
  zone: string;
  step?: number;
  from?: number;
  to?: number;
  className?: string;
}) {
  const values: number[] = [];
  for (let minute = from; minute <= to; minute += step) values.push(minute);
  if (!values.includes(value)) {
    values.push(value);
    values.sort((a, b) => a - b);
  }
  return (
    <select
      aria-label={label}
      className={cn("field tabular-nums", className)}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {values.map((minute) => (
        <option key={minute} value={minute}>
          {formatClockMinutes(minute, zone, format)}
        </option>
      ))}
    </select>
  );
}
