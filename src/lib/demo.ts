/**
 * Interactive Demo Mode — pure state & quota logic (client-side only).
 *
 * The demo NEVER writes to the real HCM workspace: every action lives in
 * this local state so visitors can try all five modules without touching
 * company data, and the session persists (localStorage) until the user
 * explicitly clicks "End Demo". A 6th action in any module triggers the
 * quota-reached upsell modal.
 */

export type DemoQuotaKey = "employees" | "checkins" | "leaves" | "receipts" | "ai";

export const DEMO_QUOTA_LIMIT = 5;

export const DEMO_QUOTA_LABELS: Record<DemoQuotaKey, string> = {
  employees: "Employees",
  checkins: "Check-ins",
  leaves: "Leaves",
  receipts: "Receipts",
  ai: "AI",
};

export interface DemoEmployee {
  id: string;
  name: string;
  code: string;
  department: string;
  salary: number;
}

export interface DemoAttendanceRecord {
  id: string;
  employeeName: string;
  kind: "check-in" | "check-out";
  at: string;
  distanceM: number;
  late: boolean;
}

export interface DemoLeave {
  id: string;
  employeeName: string;
  type: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
}

export interface DemoPayslip {
  id: string;
  employeeName: string;
  month: string;
  gross: number;
  deductions: number;
  net: number;
}

export interface DemoState {
  active: boolean;
  startedAt: string;
  quotas: Record<DemoQuotaKey, number>;
  employees: DemoEmployee[];
  attendance: DemoAttendanceRecord[];
  leaves: DemoLeave[];
  payslips: DemoPayslip[];
}

export const DEMO_STORAGE_KEY = "hcm-demo-session";

export function newDemoState(): DemoState {
  return {
    active: true,
    startedAt: new Date().toISOString(),
    quotas: { employees: 0, checkins: 0, leaves: 0, receipts: 0, ai: 0 },
    employees: [],
    attendance: [],
    leaves: [],
    payslips: [],
  };
}

/**
 * Attempt to consume one unit of a module's quota. Returns ok:false when the
 * module is already at DEMO_QUOTA_LIMIT — the caller then shows the
 * quota-reached modal. The state is never mutated when blocked.
 */
export function consumeQuota(
  state: DemoState,
  key: DemoQuotaKey,
): { ok: true; state: DemoState } | { ok: false; state: DemoState } {
  if (state.quotas[key] >= DEMO_QUOTA_LIMIT) {
    return { ok: false, state };
  }
  return {
    ok: true,
    state: { ...state, quotas: { ...state.quotas, [key]: state.quotas[key] + 1 } },
  };
}

export function quotaComplete(state: DemoState): boolean {
  return (Object.keys(state.quotas) as DemoQuotaKey[]).every((k) => state.quotas[k] >= DEMO_QUOTA_LIMIT);
}

export function isDemoState(value: unknown): value is DemoState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<DemoState>;
  return (
    v.active === true &&
    typeof v.startedAt === "string" &&
    typeof v.quotas === "object" &&
    v.quotas !== null &&
    Array.isArray(v.employees) &&
    Array.isArray(v.attendance) &&
    Array.isArray(v.leaves) &&
    Array.isArray(v.payslips)
  );
}

export function loadDemoState(): DemoState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isDemoState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDemoState(state: DemoState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full/blocked — demo still works for this page session
  }
}

export function clearDemoState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Resume an in-progress demo or start a fresh one. */
export function startDemo(): DemoState {
  const existing = loadDemoState();
  return existing ?? newDemoState();
}
