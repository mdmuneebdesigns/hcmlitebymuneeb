import { describe, expect, it } from "vitest";
import {
  checkInStatus,
  dayBoardStatus,
  finalStatusAfterCheckout,
  haversineMeters,
  hhmmToMinutes,
  isWeekend,
  pktStamp,
} from "@/lib/rules/attendance-rules";

describe("pktStamp (server time -> Pakistan time)", () => {
  it("converts a UTC instant to PKT date/time", () => {
    // 2026-10-25 04:30 UTC = 09:30 PKT
    const stamp = pktStamp(new Date("2026-10-25T04:30:00Z"));
    expect(stamp.date).toBe("2026-10-25");
    expect(stamp.time).toBe("09:30");
    expect(stamp.minutes).toBe(570);
  });

  it("rolls the PKT date forward across midnight", () => {
    // 2026-10-24 20:30 UTC = 2026-10-25 01:30 PKT
    const stamp = pktStamp(new Date("2026-10-24T20:30:00Z"));
    expect(stamp.date).toBe("2026-10-25");
    expect(stamp.minutes).toBe(90);
  });

  it("gives the PKT weekday, not the UTC weekday", () => {
    // 2026-10-25 is a Sunday; 03:00 UTC is still Saturday 08:00 PKT
    const stamp = pktStamp(new Date("2026-10-25T03:00:00Z"));
    expect(stamp.date).toBe("2026-10-25");
    expect(stamp.weekday).toBe("Sunday");
  });
});

describe("late rule (office start 09:00 + 15 min grace -> late after 09:15)", () => {
  const start = "09:00";
  const grace = 15;

  it("marks 09:14 as present", () => {
    const stamp = { date: "2026-10-26", time: "09:14", minutes: hhmmToMinutes("09:14"), weekday: "Monday" };
    expect(checkInStatus(stamp, start, grace)).toBe("present");
  });

  it("marks 09:15 exactly as present", () => {
    const stamp = { date: "2026-10-26", time: "09:15", minutes: hhmmToMinutes("09:15"), weekday: "Monday" };
    expect(checkInStatus(stamp, start, grace)).toBe("present");
  });

  it("marks 09:16 as late", () => {
    const stamp = { date: "2026-10-26", time: "09:16", minutes: hhmmToMinutes("09:16"), weekday: "Monday" };
    expect(checkInStatus(stamp, start, grace)).toBe("late");
  });
});

describe("half-day rule (worked under the half-day threshold)", () => {
  it("4.9 hours becomes half_day", () => {
    expect(finalStatusAfterCheckout(4.9, 5, "present")).toBe("half_day");
  });

  it("5 hours or more keeps the check-in status", () => {
    expect(finalStatusAfterCheckout(5, 5, "late")).toBe("late");
    expect(finalStatusAfterCheckout(8, 5, "present")).toBe("present");
  });
});

describe("weekend detection", () => {
  it("flags configured weekend days", () => {
    expect(isWeekend("Saturday", ["Saturday", "Sunday"])).toBe(true);
    expect(isWeekend("Monday", ["Saturday", "Sunday"])).toBe(false);
  });
});

describe("haversine distance", () => {
  it("measures roughly the known distance", () => {
    // Karachi: Saddar ~ Mazar-e-Quaid is about 1.6 km apart.
    const d = haversineMeters(24.8607, 67.0011, 24.8734, 67.0257);
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(3200);
  });

  it("returns ~0 for the same point", () => {
    expect(haversineMeters(24.86, 67.0, 24.86, 67.0)).toBeLessThan(1);
  });
});

describe("day board display status", () => {
  it("absent when no record", () => {
    expect(dayBoardStatus(null)).toBe("absent");
  });

  it("missing_checkout when checked in but never out", () => {
    expect(dayBoardStatus({ status: "present", check_out: null })).toBe("missing_checkout");
  });

  it("keeps the stored status after checkout", () => {
    expect(dayBoardStatus({ status: "late", check_out: "2026-10-26T10:00:00Z" })).toBe("late");
  });
});
