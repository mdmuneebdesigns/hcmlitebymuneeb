import { describe, expect, it } from "vitest";
import { annualTax, isFutureMonth, monthlyTax, salaryBreakdown, computePayslip, eligibleWorkingDays, workingDaysInMonth, attritionRisk } from "../../lib/rules/payroll-rules";
import {
  annualTax,
  computePayslip,
  eligibleWorkingDays,
  monthlyTax,
  salaryBreakdown,
  workingDaysInMonth,
} from "@/lib/rules/payroll-rules";

describe("salary structure", () => {
  it("gross = 1.5 × basic with HRA 40% and medical 10%", () => {
    expect(salaryBreakdown(100_000)).toEqual({
      basic: 100_000,
      hra: 40_000,
      medical: 10_000,
      gross: 150_000,
    });
  });
});

describe("progressive annual tax slabs", () => {
  it("0% up to 600k", () => {
    expect(annualTax(600_000)).toBe(0);
  });
  it("5% between 600k and 1.2M", () => {
    expect(annualTax(1_200_000)).toBe(30_000);
  });
  it("30k + 15% between 1.2M and 2.4M", () => {
    expect(annualTax(2_400_000)).toBe(210_000);
  });
  it("210k + 25% between 2.4M and 3.6M", () => {
    expect(annualTax(3_600_000)).toBe(510_000);
  });
  it("510k + 35% above 3.6M", () => {
    expect(annualTax(4_800_000)).toBe(930_000);
  });
  it("monthly tax is annual/12 on gross × 12", () => {
    expect(monthlyTax(100_000)).toBe(2_500); // 1.2M annual → 30k/12
    expect(monthlyTax(50_000)).toBe(0); // 600k annual → 0
  });
});

describe("working days in month", () => {
  it("counts Mon-Fri only", () => {
    // October 2026: 31 days, weekends Sat/Sun
    expect(workingDaysInMonth(2026, 10, ["Saturday", "Sunday"], [])).toBe(22);
  });
  it("excludes holidays", () => {
    expect(workingDaysInMonth(2026, 10, ["Saturday", "Sunday"], ["2026-10-26"])).toBe(21);
  });
});

describe("proration", () => {
  it("joiner mid-month gets fewer eligible days", () => {
    const full = eligibleWorkingDays(2026, 10, "2026-10-01", null, ["Saturday", "Sunday"], []);
    const joiner = eligibleWorkingDays(2026, 10, "2026-10-15", null, ["Saturday", "Sunday"], []);
    expect(full).toBe(22);
    expect(joiner).toBeLessThan(full);
    expect(joiner).toBeGreaterThan(0);
  });
  it("leaver is clamped at exit date", () => {
    const leaver = eligibleWorkingDays(2026, 10, "2025-01-01", "2026-10-09", ["Saturday", "Sunday"], []);
    expect(leaver).toBe(7); // Oct 5–9 working days (Mon–Fri)
  });
});

describe("payslip math", () => {
  it("deducts absent + unpaid + half-days at per-day rate and 3 lates = 0.5 day", () => {
    const p = computePayslip({
      basic: 100_000,
      workingDays: 22,
      eligibleDays: 22,
      presentDays: 18,
      absentDays: 1,
      halfDays: 1,
      unpaidLeaveDays: 1,
      lates: 3,
      latePenaltyLates: 3,
      latePenaltyDays: 0.5,
    });
    expect(p.grossFull).toBe(150_000);
    expect(p.perDayRate).toBeCloseTo(150_000 / 22, 2);
    // absence = (1 + 1 + 0.5) × per-day
    expect(p.absenceDeduction).toBeCloseTo((2.5 * 150_000) / 22, 2);
    expect(p.lateDeduction).toBeCloseTo((0.5 * 150_000) / 22, 2);
    // gross 150k → annualized 1.8M → slab 1.2M–2.4M: 30k + 15% × 600k = 120k → /12 = 10k
    expect(p.tax).toBe(10_000);
    expect(p.netPay).toBeCloseTo(p.gross - p.absenceDeduction - p.lateDeduction - p.tax, 2);
    expect(p.netPay).toBeGreaterThan(0);
  });

  it("does not apply late penalty below the configured group size", () => {
    const p = computePayslip({
      basic: 100_000,
      workingDays: 22,
      eligibleDays: 22,
      presentDays: 22,
      absentDays: 0,
      halfDays: 0,
      unpaidLeaveDays: 0,
      lates: 2,
      latePenaltyLates: 3,
      latePenaltyDays: 0.5,
    });
    expect(p.lateDeduction).toBe(0);
  });

  it("prorates joiners on eligible days", () => {
    const p = computePayslip({
      basic: 100_000,
      workingDays: 22,
      eligibleDays: 11,
      presentDays: 11,
      absentDays: 0,
      halfDays: 0,
      unpaidLeaveDays: 0,
      lates: 0,
      latePenaltyLates: 3,
      latePenaltyDays: 0.5,
    });
    expect(p.gross).toBeCloseTo(75_000, 2);
  });
});
