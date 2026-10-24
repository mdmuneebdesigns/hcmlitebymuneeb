import type { AuthedContext } from "@/lib/rbac.server";
import { getOwnEmployeeId } from "@/lib/helpers.server";
import { usedDaysInYear } from "@/lib/rules/leave-rules";

/**
 * AI tools, executed server-side against the caller's RLS scope.
 * Every tool checks roles first — an employee can never read another
 * employee's salary through the assistant.
 */

export interface AiToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  run: (args: Record<string, unknown>, context: AuthedContext, roles: string[]) => Promise<unknown>;
}

async function ownEmployee(context: AuthedContext) {
  return getOwnEmployeeId(context);
}

async function orgDates(context: AuthedContext): Promise<{ weekendDays: string[]; holidays: string[] }> {
  const [c, h] = await Promise.all([
    context.supabase.from("companies").select("weekend_days").limit(1).maybeSingle(),
    context.supabase.from("public_holidays").select("holiday_date"),
  ]);
  return {
    weekendDays: ((c.data?.weekend_days as string[] | undefined) ?? ["Saturday", "Sunday"]) as string[],
    holidays: (h.data ?? []).map((x) => x.holiday_date as string),
  };
}

export const AI_TOOLS: AiToolDef[] = [
  {
    name: "get_headcount",
    description: "Active employee headcount, optionally broken down by department.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async (_args, context) => {
      const { data } = await context.supabase
        .from("employees")
        .select("id, department_id, departments(name)")
        .eq("status", "active");
      const rows = data ?? [];
      const byDept = new Map<string, number>();
      for (const e of rows) {
        const name = (e as unknown as { departments: { name: string } | null }).departments?.name ?? "Unassigned";
        byDept.set(name, (byDept.get(name) ?? 0) + 1);
      }
      return { headcount: rows.length, byDepartment: Object.fromEntries(byDept) };
    },
  },
  {
    name: "get_attendance_summary",
    description: "Attendance summary (present/late/half-day/missing-checkout counts and rates) for a date range. Default: last 30 days.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date YYYY-MM-DD (optional)" },
        to: { type: "string", description: "End date YYYY-MM-DD (optional)" },
      },
      required: [],
    },
    run: async (args, context) => {
      const to = typeof args["to"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args["to"]) ? args["to"] : new Date().toISOString().slice(0, 10);
      const from =
        typeof args["from"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args["from"])
          ? args["from"]
          : new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const { data } = await context.supabase
        .from("attendance")
        .select("status")
        .gte("work_date", from)
        .lte("work_date", to);
      const rows = (data ?? []) as { status: string }[];
      const counts = { present: 0, late: 0, half_day: 0, missing_checkout: 0, other: 0 };
      for (const r of rows) {
        if (r.status in counts) {
          const bucket = counts as Record<string, number>;
          bucket[r.status] = (bucket[r.status] ?? 0) + 1;
        } else counts.other += 1;
      }
      const checkins = counts.present + counts.late + counts.half_day + counts.missing_checkout;
      return { from, to, totalRecords: rows.length, ...counts, lateRatePct: checkins ? Math.round((counts.late / checkins) * 1000) / 10 : 0 };
    },
  },
  {
    name: "get_late_comers",
    description: "Employees who arrived late on a given date (default today, Pakistan time). HR/Admin only.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "Date YYYY-MM-DD (optional)" } },
      required: [],
    },
    run: async (args, context, roles) => {
      if (!roles.includes("hr") && !roles.includes("admin")) {
        return { error: "Only HR and Admin can view the whole team's late comers. Ask me about your own attendance instead." };
      }
      const date = typeof args["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args["date"])
        ? args["date"]
        : new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
      const { data } = await context.supabase
        .from("attendance")
        .select("employee_id, check_in, status, employees(full_name, employee_code, departments(name))")
        .eq("work_date", date)
        .in("status", ["late"]);
      return {
        date,
        count: (data ?? []).length,
        employees: (data ?? []).map((r) => {
          const e = (r as unknown as { employees: { full_name: string; employee_code: string; departments: { name: string } | null } | null }).employees;
          return { name: e?.full_name ?? null, code: e?.employee_code ?? null, department: e?.departments?.name ?? null, checkIn: r.check_in };
        }),
      };
    },
  },
  {
    name: "get_leave_summary",
    description: "Leave summary for the current year: per-type usage and pending requests. HR/Admin see the whole org; employees see their own.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async (_args, context, roles) => {
      const own = await ownEmployee(context);
      const isPrivileged = roles.includes("hr") || roles.includes("admin");
      const year = new Date().getFullYear();
      const q = context.supabase
        .from("leave_requests")
        .select("employee_id, status, working_days, leave_types(name)")
        .gte("start_date", `${year}-01-01`);
      const { data } = isPrivileged ? await q : await q.eq("employee_id", own ?? "00000000-0000-0000-0000-000000000000");
      const rows = (data ?? []) as { employee_id: string; status: string; working_days: number; leave_types: { name: string } | null }[];
      const byType = new Map<string, { approved: number; pending: number }>();
      for (const r of rows) {
        const t = r.leave_types?.name ?? "Unknown";
        const s = byType.get(t) ?? { approved: 0, pending: 0 };
        if (r.status === "approved") s.approved += r.working_days;
        if (r.status === "pending") s.pending += r.working_days;
        byType.set(t, s);
      }
      return {
        year,
        scope: isPrivileged ? "organization" : "own",
        distinctEmployees: isPrivileged ? new Set(rows.map((r) => r.employee_id)).size : 1,
        byType: Object.fromEntries(byType),
      };
    },
  },
  {
    name: "get_my_leave_balance",
    description: "The signed-in employee's own leave balances (used / pending / remaining per leave type).",
    parameters: { type: "object", properties: {}, required: [] },
    run: async (_args, context) => {
      const own = await ownEmployee(context);
      if (!own) return { error: "No employee profile is linked to your account." };
      const year = new Date().getFullYear();
      const [ltRes, lvRes] = await Promise.all([
        context.supabase.from("leave_types").select("id, name, annual_quota, is_paid"),
        context.supabase
          .from("leave_requests")
          .select("start_date, working_days, status, leave_type_id")
          .eq("employee_id", own)
          .gte("start_date", `${year}-01-01`),
      ]);
      const rows = (lvRes.data ?? []) as { start_date: string; working_days: number; status: string; leave_type_id: string }[];
      return {
        year,
        balances: (ltRes.data ?? []).map((t) => {
          const mine = rows.filter((r) => r.leave_type_id === t.id);
          const approved = mine.filter((r) => r.status === "approved").reduce((s, r) => s + r.working_days, 0);
          const pending = mine.filter((r) => r.status === "pending").reduce((s, r) => s + r.working_days, 0);
          return {
            type: t.name,
            isPaid: t.is_paid,
            quota: t.annual_quota === null ? "unlimited" : t.annual_quota,
            used: approved,
            pending,
            remaining: t.annual_quota === null ? "unlimited" : Math.max(0, Number(t.annual_quota) - approved - pending),
          };
        }),
      };
    },
  },
  {
    name: "get_payroll_summary",
    description: "Latest payroll run totals (HR/Admin) or the employee's own latest payslip. Salary data is never exposed across employees.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async (_args, context, roles) => {
      const isPrivileged = roles.includes("hr") || roles.includes("admin");
      if (isPrivileged) {
        const { data: run } = await context.supabase
          .from("payroll_runs")
          .select("period_year, period_month, status, total_gross, total_net, working_days")
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!run) return { message: "No payroll has been run yet." };
        return { latestRun: run };
      }
      const own = await ownEmployee(context);
      if (!own) return { error: "No employee profile is linked to your account." };
      const { data: slip } = await context.supabase
        .from("payslips")
        .select("net_pay, gross_salary, tax, absence_deduction, late_deduction, payroll_runs(period_year, period_month, status)")
        .eq("employee_id", own)
        .order("run_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!slip) return { message: "No payslip has been issued for you yet." };
      return { myLatestPayslip: slip };
    },
  },
  {
    name: "search_employees",
    description: "Search employees by name or code. Returns names, codes, departments, designations and status. Salary only appears for HR/Admin.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search text (name or employee code)" } },
      required: [],
    },
    run: async (args, context, roles) => {
      const isPrivileged = roles.includes("hr") || roles.includes("admin");
      let q = context.supabase
        .from("employees")
        .select("id, full_name, employee_code, status, departments(name), designations(name)" + (isPrivileged ? ", basic_salary" : ""))
        .limit(10);
      const query = typeof args["query"] === "string" ? args["query"].trim() : "";
      if (query) q = q.or(`full_name.ilike.%${query}%,employee_code.ilike.%${query}%`);
      const { data } = await q;
      return {
        scope: isPrivileged ? "hr_admin" : "employee_public_fields_only",
        results: (data ?? []).map((e) => {
          const row = e as unknown as {
            full_name: string;
            employee_code: string;
            status: string;
            departments: { name: string } | null;
            designations: { name: string } | null;
            basic_salary?: number;
          };
          return {
            name: row.full_name,
            code: row.employee_code,
            department: row.departments?.name ?? null,
            designation: row.designations?.name ?? null,
            status: row.status,
            salary: isPrivileged && typeof row.basic_salary === "number" ? row.basic_salary : undefined,
          };
        }),
      };
    },
  },
  {
    name: "get_office_policy",
    description: "Company office settings: start time, grace minutes, half-day threshold, weekend days, late penalty rule and geofence radius.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async (_args, context) => {
      const { data } = await context.supabase
        .from("companies")
        .select(
          "name, office_start, grace_minutes, half_day_hours, weekend_days, late_penalty_lates, late_penalty_days, geofence_radius_m",
        )
        .limit(1)
        .maybeSingle();
      return data ?? { message: "Office settings not configured yet." };
    },
  },
];

export function findTool(name: string): AiToolDef | undefined {
  return AI_TOOLS.find((t) => t.name === name);
}

/** Used quota for a type (exposed for the smart-leave prefill check). */
export function quotaUsedForType(
  rows: { start_date: string; working_days: number; status: string }[],
  year: number,
): number {
  return usedDaysInYear(
    rows.filter((r) => r.status === "approved").map((r) => ({ start_date: r.start_date, end_date: r.start_date, working_days: r.working_days })),
    year,
  );
}

export { orgDates };
