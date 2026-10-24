import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyRole, type AuthedContext } from "@/lib/rbac.server";
import { getOwnEmployeeId } from "@/lib/helpers.server";
import { attritionRisk, workingDaysInMonth } from "@/lib/rules/payroll-rules";

// ---------- Types (client-safe) ----------

export interface KpiBlock {
  headcount: number;
  newJoiners: number;
  exits: number;
  attendanceRate: number; // %
  lateRate: number; // %
  absenteeismRate: number; // %
  leaveUtilization: number; // %
  payrollCostNet: number | null; // latest run
  payrollPeriod: string | null;
  presentDays: number;
  expectedDays: number;
}

export interface TrendPoint {
  label: string;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
}

export interface DepartmentPoint {
  name: string;
  headcount: number;
  attendanceRate: number;
}

export interface AttritionFlag {
  employeeId: string;
  name: string;
  code: string;
  department: string | null;
  score: number;
  reasons: string[];
}

export interface AnomalyFlag {
  kind: string;
  severity: "high" | "medium";
  message: string;
}

export interface DashboardData {
  role: "admin" | "hr" | "employee";
  kpis: KpiBlock | null;
  trend: TrendPoint[];
  departments: DepartmentPoint[];
  attrition: AttritionFlag[];
  anomalies: AnomalyFlag[];
  my: {
    presentDays: number;
    lateDays: number;
    absentDays: number;
    leaveBalanceSummary: string | null;
  } | null;
  range: { from: string; to: string };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

async function loadOrgContext(supabase: AuthedContext["supabase"]) {
  const [companyRes, holidayRes] = await Promise.all([
    supabase.from("companies").select("weekend_days").limit(1).maybeSingle(),
    supabase.from("public_holidays").select("holiday_date"),
  ]);
  return {
    weekendDays: ((companyRes.data?.weekend_days as string[] | undefined) ?? ["Saturday", "Sunday"]) as string[],
    holidays: (holidayRes.data ?? []).map((h) => h.holiday_date as string),
  };
}

// ---------- HR/Admin dashboard ----------

export const getOrgDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string; departmentId?: string | null }) => input)
  .handler(async ({ context, data }): Promise<DashboardData> => {
    const held = await requireAnyRole(context, "hr", "admin");
    const role = held.includes("admin") ? "admin" : "hr";
    const { supabase } = context;
    const from = ISO.test(data.from) ? data.from : new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const to = ISO.test(data.to) ? data.to : new Date().toISOString().slice(0, 10);

    const org = await loadOrgContext(supabase);

    let empQuery = supabase
      .from("employees")
      .select("id, full_name, employee_code, join_date, exit_date, department_id, departments(name), basic_salary, user_id")
      .lte("join_date", to)
      .or(`exit_date.is.null,exit_date.gte.${from}`)
      .order("full_name");
    if (data.departmentId) empQuery = empQuery.eq("department_id", data.departmentId);
    const { data: employees, error } = await empQuery;
    if (error) throw new Error("Could not load employees");

    const employeeList = employees ?? [];
    const ids = employeeList.map((e) => e.id);

    const [attRes, leaveRes, runRes] = await Promise.all([
      ids.length
        ? supabase
            .from("attendance")
            .select("employee_id, status, work_date")
            .in("employee_id", ids)
            .gte("work_date", from)
            .lte("work_date", to)
        : Promise.resolve({ data: [] as never[] }),
      ids.length
        ? supabase
            .from("leave_requests")
            .select("employee_id, start_date, end_date, working_days, status, leave_types(name, is_paid, annual_quota)")
            .in("employee_id", ids)
            .gte("start_date", `${new Date().getFullYear()}-01-01`)
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("payroll_runs")
        .select("period_year, period_month, total_net, status")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(1),
    ]);

    const attendance = attRes.data ?? [];
    const leaves = (leaveRes.data ?? []) as {
      employee_id: string;
      start_date: string;
      end_date: string;
      working_days: number;
      status: string;
      leave_types: { name: string; is_paid: boolean; annual_quota: number | null } | null;
    }[];

    // Working days in the range (skip weekends/holidays)
    let workingDaysInRange = 0;
    for (const d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()] as string;
      if (org.weekendDays.includes(day)) continue;
      if (org.holidays.includes(iso)) continue;
      workingDaysInRange += 1;
    }

    let presentCredits = 0;
    let lateCount = 0;
    let missingCheckout = 0;
    const byEmp = new Map<string, { present: number; late: number; half: number; other: number }>();
    for (const a of attendance) {
      const s = byEmp.get(a.employee_id) ?? { present: 0, late: 0, half: 0, other: 0 };
      if (a.status === "present" || a.status === "missing_checkout") s.present += 1;
      if (a.status === "late") s.late += 1;
      if (a.status === "half_day") s.half += 1;
      byEmp.set(a.employee_id, s);
      if (a.status === "late") lateCount += 1;
      if (a.status === "missing_checkout") missingCheckout += 1;
    }

    // Paid approved leave days in range count as present
    const paidLeaveByEmp = new Map<string, number>();
    for (const l of leaves) {
      if (l.status !== "approved") continue;
      const isPaid = l.leave_types?.is_paid ?? true;
      if (!isPaid) continue;
      const s = l.start_date > from ? l.start_date : from;
      const e = l.end_date < to ? l.end_date : to;
      if (e < s) continue;
      const total = l.working_days || 1;
      const span =
        Math.round((new Date(`${e}T12:00:00Z`).getTime() - new Date(`${s}T12:00:00Z`).getTime()) / 86400000) + 1;
      const fullSpan =
        Math.round(
          (new Date(`${l.end_date}T12:00:00Z`).getTime() - new Date(`${l.start_date}T12:00:00Z`).getTime()) / 86400000,
        ) + 1;
      paidLeaveByEmp.set(l.employee_id, (paidLeaveByEmp.get(l.employee_id) ?? 0) + (total * span) / fullSpan);
    }

    // Expected = sum over employees of working days they were eligible in range
    let expectedDays = 0;
    let totalPresentCredits = 0;
    for (const e of employeeList) {
      const effFrom = e.join_date > from ? e.join_date : from;
      const effTo = e.exit_date && e.exit_date < to ? e.exit_date : to;
      let eligible = 0;
      if (effTo >= effFrom) {
        for (const d = new Date(`${effFrom}T12:00:00Z`); d <= new Date(`${effTo}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
          const iso = d.toISOString().slice(0, 10);
          const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()] as string;
          if (org.weekendDays.includes(day)) continue;
          if (org.holidays.includes(iso)) continue;
          eligible += 1;
        }
      }
      expectedDays += eligible;
      const s = byEmp.get(e.id) ?? { present: 0, late: 0, half: 0, other: 0 };
      const credits = s.present + 0.5 * s.half + (paidLeaveByEmp.get(e.id) ?? 0);
      totalPresentCredits += credits;
      presentCredits += credits;
    }

    const absentDays = Math.max(0, expectedDays - presentCredits - 0);
    const totalQuota = employeeList.reduce((s, e) => s + 14 + 8 + 10, 0); // default types when absent
    const approvedLeaveDays = leaves.filter((l) => l.status === "approved").reduce((s, l) => s + l.working_days, 0);

    const kpis: KpiBlock = {
      headcount: employeeList.length,
      newJoiners: employeeList.filter((e) => e.join_date >= from).length,
      exits: (await countExits(supabase, from, to, data.departmentId ?? null)) ?? 0,
      attendanceRate: pct(totalPresentCredits, expectedDays),
      lateRate: pct(lateCount, Math.max(1, attendance.length)),
      absenteeismRate: pct(absentDays, Math.max(1, expectedDays)),
      leaveUtilization: pct(approvedLeaveDays, Math.max(1, totalQuota)),
      payrollCostNet: runRes.data?.[0]?.total_net ?? null,
      payrollPeriod: runRes.data?.[0]
        ? `${runRes.data[0].period_year}-${String(runRes.data[0].period_month).padStart(2, "0")} (${runRes.data[0].status})`
        : null,
      presentDays: Math.round(totalPresentCredits * 10) / 10,
      expectedDays,
    };
    void workingDaysInRange;

    // Trend: weekly buckets over the range
    const trend = buildTrend(from, to, attendance, paidLeaveByEmp, org.weekendDays, org.holidays, employeeList);

    // Department breakdown
    const deptMap = new Map<string, { headcount: number; credits: number; expected: number }>();
    for (const e of employeeList) {
      const name = e.departments?.name ?? "Unassigned";
      const s = deptMap.get(name) ?? { headcount: 0, credits: 0, expected: 0 };
      s.headcount += 1;
      const st = byEmp.get(e.id) ?? { present: 0, late: 0, half: 0, other: 0 };
      s.credits += st.present + 0.5 * st.half + (paidLeaveByEmp.get(e.id) ?? 0);
      s.expected += 1; // per-employee slot; rate normalized below
      deptMap.set(name, s);
    }
    const departments: DepartmentPoint[] = [...deptMap.entries()].map(([name, s]) => ({
      name,
      headcount: s.headcount,
      attendanceRate: pct(s.credits, Math.max(1, s.expected * workingDaysInRange)),
    }));

    // Attrition risk (top 6)
    const now = Date.now();
    const attrition: AttritionFlag[] = employeeList
      .map((e) => {
        const tenureMonths = Math.max(0, Math.round((now - new Date(e.join_date).getTime()) / (30 * 86400000)));
        const st = byEmp.get(e.id) ?? { present: 0, late: 0, half: 0, other: 0 };
        const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
        const absentRate = 1 - (st.present + 0.5 * st.half + (paidLeaveByEmp.get(e.id) ?? 0)) / Math.max(1, workingDaysInRange);
        const lateRate = st.late / Math.max(1, days / 7);
        const myLeaves = leaves.filter((l) => l.employee_id === e.id && l.status === "approved");
        const myQuota = 32; // Annual+Sick+Casual default total
        const leaveUtilization = myLeaves.reduce((s, l) => s + l.working_days, 0) / myQuota;
        const unpaid = leaves
          .filter((l) => l.employee_id === e.id && l.status === "approved" && !(l.leave_types?.is_paid ?? true))
          .reduce((s, l) => s + l.working_days, 0);
        const score = attritionRisk({ tenureMonths, absentRate, lateRate, leaveUtilization, unpaidLeaveDays: unpaid });
        const reasons: string[] = [];
        if (tenureMonths <= 6) reasons.push("New joiner (≤6 months)");
        if (absentRate > 0.25) reasons.push(`High absence (${Math.round(absentRate * 100)}%)`);
        if (st.late >= 6) reasons.push(`${st.late} late arrivals`);
        if (unpaid > 0) reasons.push(`${unpaid} unpaid leave days`);
        return {
          employeeId: e.id,
          name: e.full_name,
          code: e.employee_code,
          department: e.departments?.name ?? null,
          score,
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    // Anomaly flags
    const anomalies: AnomalyFlag[] = [];
    if (kpis.absenteeismRate > 25)
      anomalies.push({ kind: "absenteeism", severity: "high", message: `Absenteeism is ${kpis.absenteeismRate}% — above the 25% warning line` });
    if (kpis.lateRate > 20)
      anomalies.push({ kind: "late", severity: "medium", message: `Late arrivals are ${kpis.lateRate}% of check-ins this period` });
    if (missingCheckout >= 5)
      anomalies.push({ kind: "missing_checkout", severity: "medium", message: `${missingCheckout} missing check-outs recorded` });
    for (const a of attrition) {
      if (a.score >= 60) anomalies.push({ kind: "attrition", severity: "high", message: `${a.name} has attrition risk score ${a.score}/100` });
    }
    const pendingLeaves = leaves.filter((l) => l.status === "pending").length;
    if (pendingLeaves > 0)
      anomalies.push({ kind: "pending", severity: "medium", message: `${pendingLeaves} leave request(s) awaiting decision` });

    return { role, kpis, trend, departments, attrition, anomalies, my: null, range: { from, to } };
  });

async function countExits(
  supabase: AuthedContext["supabase"],
  from: string,
  to: string,
  departmentId: string | null,
): Promise<number> {
  let q = supabase.from("employees").select("id", { count: "exact", head: true }).gte("exit_date", from).lte("exit_date", to);
  if (departmentId) q = q.eq("department_id", departmentId);
  const { count } = await q;
  return count ?? 0;
}

function buildTrend(
  from: string,
  to: string,
  attendance: { employee_id: string; status: string; work_date: string }[],
  paidLeaveByEmp: Map<string, number>,
  weekendDays: string[],
  holidays: string[],
  employees: { id: string }[],
): TrendPoint[] {
  // Bucket by week (max 6 buckets)
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const bucketCount = Math.min(6, Math.max(1, Math.ceil(spanDays / 7)));
  const bucketSize = Math.ceil(spanDays / bucketCount);
  const buckets: TrendPoint[] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const bStart = new Date(start);
    bStart.setUTCDate(bStart.getUTCDate() + i * bucketSize);
    const label = bStart.toISOString().slice(5, 10);
    buckets.push({ label, present: 0, late: 0, absent: 0, onLeave: 0 });
  }
  const idxOf = (iso: string) => {
    const diff = Math.round((new Date(`${iso}T12:00:00Z`).getTime() - start.getTime()) / 86400000);
    return Math.min(bucketCount - 1, Math.max(0, Math.floor(diff / bucketSize)));
  };
  const presentByBucket = new Array(bucketCount).fill(0) as number[];
  const expectedByBucket = new Array(bucketCount).fill(0) as number[];
  for (const a of attendance) {
    const i = idxOf(a.work_date);
    if (a.status === "present" || a.status === "missing_checkout") presentByBucket[i] += 1;
    if (a.status === "late") presentByBucket[i] += 1;
    if (a.status === "late") buckets[i].late += 1;
    if (a.status === "half_day") presentByBucket[i] += 0.5;
  }
  for (const [empId, days] of paidLeaveByEmp) {
    void empId;
    // spread paid leave across the range evenly (approximation for the chart)
    for (let i = 0; i < bucketCount; i += 1) buckets[i].onLeave += Math.round(((days / spanDays) * bucketSize) * 10) / 10;
  }
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()] as string;
    if (weekendDays.includes(day) || holidays.includes(iso)) continue;
    expectedByBucket[idxOf(iso)] += employees.length;
  }
  buckets.forEach((b, i) => {
    b.present = Math.round(presentByBucket[i] * 10) / 10;
    b.absent = Math.max(0, Math.round((expectedByBucket[i] - presentByBucket[i]) * 10) / 10);
  });
  return buckets;
}

// ---------- Employee dashboard ----------

export const getMyDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from?: string; to?: string }) => input)
  .handler(async ({ context, data }): Promise<DashboardData> => {
    await requireAnyRole(context, "employee", "hr", "admin");
    const employeeId = await getOwnEmployeeId(context);
    const from = data.from ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const base: DashboardData = {
      role: "employee",
      kpis: null,
      trend: [],
      departments: [],
      attrition: [],
      anomalies: [],
      my: { presentDays: 0, lateDays: 0, absentDays: 0, leaveBalanceSummary: null },
      range: { from, to },
    };
    if (!employeeId) return base;

    const { supabase } = context;
    const org = await loadOrgContext(supabase);
    const [attRes, leaveRes, ltRes] = await Promise.all([
      supabase
        .from("attendance")
        .select("status")
        .eq("employee_id", employeeId)
        .gte("work_date", from)
        .lte("work_date", to),
      supabase
        .from("leave_requests")
        .select("working_days, status, leave_types(name, is_paid)")
        .eq("employee_id", employeeId)
        .gte("start_date", `${new Date().getFullYear()}-01-01`),
      supabase.from("leave_types").select("name, annual_quota"),
    ]);
    const rows = attRes.data ?? [];
    const present = rows.filter((r) => r.status === "present" || r.status === "missing_checkout").length;
    const half = rows.filter((r) => r.status === "half_day").length;
    const late = rows.filter((r) => r.status === "late").length;
    const credits = present + 0.5 * half + late;

    let workingDaysInRange = 0;
    for (const d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()] as string;
      if (org.weekendDays.includes(day) || org.holidays.includes(iso)) continue;
      workingDaysInRange += 1;
    }

    const quotaSum = (ltRes.data ?? []).reduce(
      (s, t) => s + (t.annual_quota === null ? 0 : Number(t.annual_quota)),
      0,
    );
    const used = (leaveRes.data ?? []).filter((l) => l.status === "approved").reduce((s, l) => s + l.working_days, 0);

    base.my = {
      presentDays: credits,
      lateDays: late,
      absentDays: Math.max(0, Math.round((workingDaysInRange - credits) * 10) / 10),
      leaveBalanceSummary: quotaSum > 0 ? `${used} of ${quotaSum} leave days used this year (${pct(used, quotaSum)}%)` : null,
    };
    void workingDaysInMonth;
    return base;
  });
