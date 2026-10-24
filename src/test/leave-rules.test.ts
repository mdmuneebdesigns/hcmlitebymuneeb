import { describe, expect, it } from "vitest";
import {
  isWeekendDate,
  overlapsAny,
  usedDaysInYear,
  validateLeaveRequest,
  workingDaysBetween,
} from "@/lib/rules/leave-rules";

const WEEKEND = ["Saturday", "Sunday"];

describe("working-day math", () => {
  it("skips weekends", () => {
    // Mon 2026-10-26 .. Sun 2026-11-01 → 5 working days
    expect(workingDaysBetween("2026-10-26", "2026-11-01", WEEKEND, [])).toBe(5);
  });

  it("skips configured weekends and public holidays", () => {
    expect(workingDaysBetween("2026-10-26", "2026-10-30", WEEKEND, ["2026-10-28"])).toBe(4);
  });

  it("returns 0 when end is before start", () => {
    expect(workingDaysBetween("2026-10-30", "2026-10-26", WEEKEND, [])).toBe(0);
  });

  it("detects weekend dates", () => {
    expect(isWeekendDate("2026-10-24", WEEKEND)).toBe(true); // Saturday
    expect(isWeekendDate("2026-10-26", WEEKEND)).toBe(false); // Monday
  });
});

describe("overlap rule", () => {
  const existing = [{ start_date: "2026-11-02", end_date: "2026-11-04", working_days: 3 }];
  it("detects overlap", () => {
    expect(overlapsAny("2026-11-04", "2026-11-06", existing)).toBe(true);
    expect(overlapsAny("2026-10-30", "2026-11-02", existing)).toBe(true);
  });
  it("passes non-overlapping range", () => {
    expect(overlapsAny("2026-11-05", "2026-11-10", existing)).toBe(false);
  });
});

describe("validateLeaveRequest", () => {
  const base = {
    weekendDays: WEEKEND,
    holidays: [] as string[],
    quota: 14 as number | null,
    alreadyUsed: 0,
    pendingOverlap: [] as { start_date: string; end_date: string; working_days: number }[],
  };

  it("accepts a valid range and counts working days", () => {
    const r = validateLeaveRequest({ ...base, startDate: "2026-11-02", endDate: "2026-11-03" });
    expect(r).toEqual({ ok: true, workingDays: 2 });
  });

  it("answers 422 on overlap", () => {
    const r = validateLeaveRequest({
      ...base,
      startDate: "2026-11-03",
      endDate: "2026-11-05",
      pendingOverlap: [{ start_date: "2026-11-02", end_date: "2026-11-04", working_days: 3 }],
    });
    expect(r).toEqual({ ok: false, code: 422, error: expect.stringContaining("overlap") });
  });

  it("answers 422 when quota is exceeded", () => {
    const r = validateLeaveRequest({ ...base, startDate: "2026-11-02", endDate: "2026-11-06", alreadyUsed: 12 });
    expect(r).toEqual({ ok: false, code: 422, error: expect.stringContaining("Quota exceeded") });
  });

  it("allows unlimited quota (null)", () => {
    const r = validateLeaveRequest({ ...base, startDate: "2026-11-02", endDate: "2026-11-30", quota: null });
    expect(r.ok).toBe(true);
  });

  it("answers 422 for a weekend-only range", () => {
    const r = validateLeaveRequest({ ...base, startDate: "2026-10-31", endDate: "2026-11-01" });
    expect(r).toEqual({ ok: false, code: 422, error: expect.stringContaining("no working days") });
  });
});

describe("used quota", () => {
  it("sums approved days within the calendar year only", () => {
    const approved = [
      { start_date: "2026-02-02", end_date: "2026-02-04", working_days: 3 },
      { start_date: "2025-12-01", end_date: "2025-12-05", working_days: 5 },
    ];
    expect(usedDaysInYear(approved, 2026)).toBe(3);
  });
});
