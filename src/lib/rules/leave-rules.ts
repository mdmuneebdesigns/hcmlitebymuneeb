/**
 * Leave rules — pure functions, no DB access, unit-testable.
 * Working-day math skips configured weekend days and public holidays.
 */

export function isWeekendDate(dateISO: string, weekendDays: string[]): boolean {
  // ISO date strings are parsed as UTC noon to stay date-stable.
  const d = new Date(`${dateISO}T12:00:00Z`);
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return weekendDays.includes(names[d.getUTCDay()] as string);
}

/**
 * Count working days in an inclusive date range, skipping weekends and holidays.
 * Returns 0 for invalid ranges (end before start).
 */
export function workingDaysBetween(
  startDate: string,
  endDate: string,
  weekendDays: string[],
  holidays: string[],
): number {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const holidaySet = new Set(holidays);
  let count = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (isWeekendDate(iso, weekendDays)) continue;
    if (holidaySet.has(iso)) continue;
    count += 1;
  }
  return count;
}

export interface ExistingLeave {
  start_date: string;
  end_date: string;
  working_days: number;
}

/** True when [start,end] overlaps any existing leave range (inclusive). */
export function overlapsAny(startDate: string, endDate: string, existing: ExistingLeave[]): boolean {
  return existing.some((l) => l.start_date <= endDate && startDate <= l.end_date);
}

export type LeaveValidation =
  | { ok: true; workingDays: number }
  | { ok: false; code: number; error: string };

export interface LeaveValidationInput {
  startDate: string;
  endDate: string;
  weekendDays: string[];
  holidays: string[];
  quota: number | null; // null = unlimited
  alreadyUsed: number; // approved working days this year
  pendingOverlap: ExistingLeave[]; // pending + approved leaves
}

/**
 * Validates a leave request. Returns HTTP-style codes so the server fn can
 * answer 422 for business-rule failures (overlap, over-quota, empty range).
 */
export function validateLeaveRequest(input: LeaveValidationInput): LeaveValidation {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(input.startDate) || !dateRe.test(input.endDate)) {
    return { ok: false, code: 422, error: "Use valid dates (YYYY-MM-DD)" };
  }
  if (input.endDate < input.startDate) {
    return { ok: false, code: 422, error: "End date cannot be before the start date" };
  }
  const workingDays = workingDaysBetween(input.startDate, input.endDate, input.weekendDays, input.holidays);
  if (workingDays === 0) {
    return {
      ok: false,
      code: 422,
      error: "This range contains no working days (weekends and public holidays are skipped)",
    };
  }
  if (overlapsAny(input.startDate, input.endDate, input.pendingOverlap)) {
    return { ok: false, code: 422, error: "You already have a leave request overlapping these dates" };
  }
  if (input.quota !== null && input.alreadyUsed + workingDays > input.quota) {
    return {
      ok: false,
      code: 422,
      error: `Quota exceeded: ${input.quota} days per year, ${input.alreadyUsed} already used, ${workingDays} requested`,
    };
  }
  return { ok: true, workingDays };
}

/** Used quota counts only approved leaves inside the same calendar year. */
export function usedDaysInYear(approved: ExistingLeave[], year: number): number {
  return approved.reduce((sum, l) => {
    const y = Number(l.start_date.slice(0, 4));
    if (y !== year) return sum;
    return sum + l.working_days;
  }, 0);
}
