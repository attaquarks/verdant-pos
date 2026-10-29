import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DateRange } from "./types";

export type SearchParams = Record<string, string | string[] | undefined>;
export function param(params: SearchParams, name: string, fallback = ""): string {
  const value = params[name];
  return typeof value === "string" ? value : fallback;
}
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function todayIn(timeZone: string, now = new Date()): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}
export function calendarBounds(
  from: string,
  to: string,
  timeZone: string,
): { start: string; end: string } {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to)
    throw new Error("Choose a valid start and end date.");
  const days = Math.round(
    (new Date(`${to}T12:00:00Z`).valueOf() - new Date(`${from}T12:00:00Z`).valueOf()) / 86400000,
  );
  if (days > 365) throw new Error("Choose a range of 366 days or fewer.");
  return {
    start: fromZonedTime(`${from}T00:00:00`, timeZone).toISOString(),
    end: fromZonedTime(`${addCalendarDays(to, 1)}T00:00:00`, timeZone).toISOString(),
  };
}
export function getDateRange(
  params: SearchParams,
  timeZone: string,
  defaultPreset = "week",
  now = new Date(),
): DateRange {
  const today = todayIn(timeZone, now);
  let preset = param(params, "period", param(params, "preset", defaultPreset));
  let from = today;
  let to = today;
  let label = "Today";
  const requestedFrom = param(params, "from");
  const requestedTo = param(params, "to");
  if (isCalendarDate(requestedFrom) && isCalendarDate(requestedTo)) {
    from = requestedFrom;
    to = requestedTo;
    preset = "custom";
    label = "Custom period";
  } else if (["day", "today", "daily"].includes(preset)) {
    preset = "day";
  } else if (["month", "monthly"].includes(preset)) {
    from = `${today.slice(0, 7)}-01`;
    preset = "month";
    label = "This month";
  } else {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    from = addCalendarDays(today, -(weekday === 0 ? 6 : weekday - 1));
    preset = "week";
    label = "This week";
  }
  // Invalid query strings do not crash a page; explicit export/API ranges use strict validation.
  try {
    return { from, to, ...calendarBounds(from, to, timeZone), label, preset };
  } catch {
    return {
      from: today,
      to: today,
      ...calendarBounds(today, today, timeZone),
      label: "Today",
      preset: "day",
    };
  }
}
export function formatDate(
  date: string | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.valueOf())) return "—";
  return new Intl.DateTimeFormat("en", {
    timeZone,
    month: "short",
    day: "numeric",
    ...options,
  }).format(value);
}
