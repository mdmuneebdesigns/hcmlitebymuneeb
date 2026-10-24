/**
 * Payroll rules — pure functions, no DB access, unit-testable.
 * Gross = 1.5 × basic (HRA 40% + medical 10% of basic).
 * Tax: progressive annual slabs applied on gross × 12, deducted monthly (annual/12).
 */

export interface SalaryBreakdown {
  basic: number;
  hra: number;
  medical: number;
  gross: number;
}

export function salaryBreakdown(basic: number): SalaryBreakdown {
  const hra = round2(basic * 0.4);
  const medical = round2(basic * 0.1);
  return { basic, hra, medical, gross: round2(basic + hra + medical) };
}

/** Monthly tax from progressive annual slabs on annualized taxable income. */
export function annualTax(annualTaxable: number): number {
  const a = Math.max(0, annualTaxable);
  if (a <= 600_000) return 0;
  if (a <= 1_200_000) return (a - 600_000) * 0.05;
  if (a <= 2_400_000) return 30_000 + (a - 1_200_000) * 0.15;
  if (a <= 3_600_000) return 210_000 + (a - 2_400_000) * 0.25;
  return 510_000 + (a - 3_600_000) * 0.35;
}

export function monthlyTax(monthlyGross: number): number {
  return round2(annualTax(monthlyGross * 12) / 12);
}

/**
 * A payroll month is runnable once it has started — the current month is
 * allowed mid-month; only a month that has not started yet is "future".
 */
export function isFutureMonth(year: number, month: number, nowMs: number): boolean {
  const startMs = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`).getTime();
  return startMs > nowMs + 26 * 3600 * 1000;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Working days in [monthStart, monthEnd] excluding weekends/holidays — the
 * denominator for the per-day rate.
 */
export function workingDaysInMonth(
  year: number,
  month: number, // 1-12
  weekendDays: string[],
  holidays: string[],
): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const holidaySet = new Set(holidays);
  let count = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const wd = names[new Date(Date.UTC(year, month - 1, d)).getUTCDay()] as string;
    if (weekendDays.includes(wd)) continue;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (holidaySet.has(iso)) continue;
    count += 1;
  }
  return count;
}

/**
 * Working days the employee is eligible to be paid for in this month —
 * clamped by join/exit dates (proration for joiners and leavers).
 */
export function eligibleWorkingDays(
  year: number,
  month: number,
  joinDate: string,
  exitDate: string | null,
  weekendDays: string[],
  holidays: string[],
): number {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
  const from = joinDate > monthStart ? joinDate : monthStart;
  const to = exitDate && exitDate < monthEnd ? exitDate : monthEnd;
  if (to < from) return 0;
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const holidaySet = new Set(holidays);
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  let count = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = names[d.getUTCDay()] as string;
    if (weekendDays.includes(wd)) continue;
    const iso = d.toISOString().slice(0, 10);
    if (holidaySet.has(iso)) continue;
    count += 1;
  }
  return count;
}

export interface PayslipInput {
  basic: number;
  workingDays: number; // total working days in the month
  eligibleDays: number; // proration denominator ceiling
  presentDays: number;
  absentDays: number;
  halfDays: number;
  unpaidLeaveDays: number;
  lates: number;
  latePenaltyLates: number; // e.g. 3 lates...
  latePenaltyDays: number; // ...cost 0.5 day
}

export interface PayslipMath {
  basic: number;
  hra: number;
  medical: number;
  grossFull: number; // full-month gross (1.5 × basic)
  gross: number; // prorated gross for joiners/leavers
  perDayRate: number;
  absenceDeduction: number; // absent + unpaid + 0.5 × half-day
  lateDeduction: number; // configurable 3-lates = 0.5-day rule
  tax: number;
  netPay: number;
}

/**
 * Full payslip math. Deductions use the full-month per-day rate; the prorated
 * gross scales by eligibleDays / workingDays for partial months.
 */
export function computePayslip(input: PayslipInput): PayslipMath {
  const { hra, medical, gross: grossFull } = salaryBreakdown(input.basic);
  const wd = input.workingDays > 0 ? input.workingDays : 1;
  const perDayRate = grossFull / wd;
  const gross = round2(perDayRate * input.eligibleDays);
  const lateGroups = Math.floor(input.lates / Math.max(1, input.latePenaltyLates));
  const latePenaltyDays = lateGroups * input.latePenaltyDays;
  const absenceDeduction = round2((input.absentDays + input.unpaidLeaveDays + 0.5 * input.halfDays) * perDayRate);
  const lateDeduction = round2(latePenaltyDays * perDayRate);
  const tax = monthlyTax(gross);
  const netPay = round2(Math.max(0, gross - absenceDeduction - lateDeduction - tax));
  return {
    basic: input.basic,
    hra,
    medical,
    grossFull: round2(grossFull),
    gross,
    perDayRate: round2(perDayRate),
    absenceDeduction,
    lateDeduction,
    tax,
    netPay,
  };
}

/** Attrition risk score (0-100) — tenure, leave behavior and attendance signals. */
export function attritionRisk(params: {
  tenureMonths: number;
  absentRate: number; // 0-1 last 90 days
  lateRate: number; // 0-1 last 90 days
  leaveUtilization: number; // 0-1 of annual quota used
  unpaidLeaveDays: number; // last 90 days
}): number {
  let score = 0;
  if (params.tenureMonths <= 6) score += 30;
  else if (params.tenureMonths <= 12) score += 20;
  else if (params.tenureMonths <= 24) score += 10;
  score += Math.min(30, Math.round(params.absentRate * 150));
  score += Math.min(15, Math.round(params.lateRate * 60));
  if (params.leaveUtilization > 0.8) score += 10;
  if (params.leaveUtilization < 0.2) score += 5;
  score += Math.min(15, params.unpaidLeaveDays * 3);
  return Math.min(100, score);
}
