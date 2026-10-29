import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  calendarBounds,
  formatDate,
  getDateRange,
  isCalendarDate,
  isTimeZone,
  todayIn,
} from "../src/lib/dates";

describe("shop timezone and calendar boundaries", () => {
  it("uses the shop day rather than server UTC", () => {
    expect(todayIn("Asia/Karachi", new Date("2026-10-27T20:30:00Z"))).toBe("2026-10-28");
    expect(todayIn("America/Los_Angeles", new Date("2026-10-28T01:00:00Z"))).toBe("2026-10-27");
  });
  it("creates half-open Karachi date bounds", () => {
    expect(calendarBounds("2026-10-28", "2026-10-28", "Asia/Karachi")).toEqual({
      start: "2026-10-27T19:00:00.000Z",
      end: "2026-10-28T19:00:00.000Z",
    });
  });
  it("handles a 23-hour daylight-saving day", () => {
    const bounds = calendarBounds("2026-03-08", "2026-03-08", "America/New_York");
    expect(bounds.start).toBe("2026-03-08T05:00:00.000Z");
    expect(bounds.end).toBe("2026-03-09T04:00:00.000Z");
  });
  it("handles a 25-hour daylight-saving day", () => {
    const bounds = calendarBounds("2026-11-01", "2026-11-01", "America/New_York");
    expect(bounds.start).toBe("2026-11-01T04:00:00.000Z");
    expect(bounds.end).toBe("2026-11-02T05:00:00.000Z");
  });
  it("starts weeks on Monday and ends at tomorrow's boundary", () => {
    const range = getDateRange(
      { period: "week" },
      "Asia/Karachi",
      "week",
      new Date("2026-10-28T09:00:00Z"),
    );
    expect(range.from).toBe("2026-10-26");
    expect(range.to).toBe("2026-10-28");
    expect(range.end).toBe("2026-10-28T19:00:00.000Z");
  });
  it("includes leap day without overflowing dates", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(addCalendarDays("2024-02-29", 1)).toBe("2024-03-01");
  });
  it("rejects invalid and excessively large explicit ranges", () => {
    expect(() => calendarBounds("2026-10-29", "2026-10-28", "UTC")).toThrow();
    expect(() => calendarBounds("2025-01-01", "2026-12-31", "UTC")).toThrow();
    expect(() => calendarBounds("2026-02-31", "2026-03-01", "UTC")).toThrow();
  });
  it("handles invalid page query strings without crashing", () => {
    const range = getDateRange(
      { from: "2026-11-01", to: "2026-10-01" },
      "UTC",
      "week",
      new Date("2026-10-28T09:00:00Z"),
    );
    expect(range.preset).toBe("day");
  });
  it("validates zones and formats timestamps in the shop zone", () => {
    expect(isTimeZone("Asia/Karachi")).toBe(true);
    expect(isTimeZone("Not/AZone")).toBe(false);
    expect(formatDate("2026-10-27T21:00:00Z", "Asia/Karachi")).toContain("28");
  });
});
