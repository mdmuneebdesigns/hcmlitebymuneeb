import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyRole } from "@/lib/rbac.server";
import { writeAudit } from "@/lib/audit.server";
import { actorEmail, getCompanyRules, getOwnEmployeeId, notify } from "@/lib/helpers.server";
import {
  computePayslip,
  eligibleWorkingDays,
  salaryBreakdown,
  workingDaysInMonth,
} from "@/lib/rules/payroll-rules";

// ---------- Types (client-safe) ----------

export interface PayrollRunDto {
  id: string;
  period_year: number;
  period_month: number;
  status: string;
  working_days: number;
  total_gross: number;
  total_net: number;
  created_at: string;
  finalized_at: string | null;
}

export interface PayslipDto {
  id: string;
  run_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_name: string | null;
  basic_salary: number;
  gross_salary: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  half_days: number;
  lates: number;
  unpaid_leave_days: number;
  per_day_rate: number;
  absence_deduction: number;
  late_deduction: number;
  tax: number;
  net_pay: number;
}

type SimpleResult = { ok: true } | { ok: false; error: string };

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------- Runs list + detail ----------

export const listPayrollRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayrollRunDto[]> => {
    await requireAnyRole(context, "hr", "admin");
    const { data, error } = await context.supabase
      .from("payroll_runs")
      .select("id, period_year, period_month, status, working_days, total_gross, total_net, created_at, finalized_at")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });
    if (error) throw new Error("Could not load payroll runs");
    return (data as PayrollRunDto[]) ?? [];
  });

export const getPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => input)
  .handler(async ({ context, data }): Promise<{ run: PayrollRunDto | null; payslips: PayslipDto[] }> => {
    await requireAnyRole(context, "hr", "admin");
    const { data: run } = await context.supabase
      .from("payroll_runs")
      .select("id, period_year, period_month, status, working_days, total_gross, total_net, created_at, finalized_at")
      .eq("id", data.runId)
      .maybeSingle();
    if (!run) return { run: null, payslips: [] };
    const { data: slips } = await context.supabase
      .from("payslips")
      .select(
        "*, employees(full_name, employee_code, departments(name))",
      )
      .eq("run_id", data.runId)
      .order("net_pay", { ascending: false });
    const payslips: PayslipDto[] = (slips ?? []).map((s) => {
      const emp = (
        s as unknown as {
          employees: { full_name: string; employee_code: string; departments: { name: string } | null } | null;
        }
      ).employees;
      return {
        id: s.id,
        run_id: s.run_id,
        employee_id: s.employee_id,
        employee_name: emp?.full_name ?? null,
        employee_code: emp?.employee_code ?? null,
        department_name: emp?.departments?.name ?? null,
        basic_salary: s.basic_salary,
        gross_salary: s.gross_salary,
        working_days: s.working_days,
        present_days: s.present_days,
        absent_days: s.absent_days,
        half_days: s.half_days,
        lates: s.lates,
        unpaid_leave_days: s.unpaid_leave_days,
        per_day_rate: s.per_day_rate,
        absence_deduction: s.absence_deduction,
        late_deduction: s.late_deduction,
        tax: s.tax,
        net_pay: s.net_pay,
      };
    });
    return { run: run as PayrollRunDto, payslips };
  });

// ---------- Draft run (HR/Admin) ----------

export const runPayrollDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { year: number; month: number }) => input)
  .handler(
    async ({ context, data }): Promise<{ ok: true; runId: string; employees: number; totalNet: number } | { ok: false; error: string }> => {
      const { supabase, userId } = context;
      await requireAnyRole(context, "hr", "admin");

      const year = data.year;
      const month = data.month;
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, error: "Invalid year" };
      if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false, error: "Invalid month" };
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
      // Reject only months that have not started yet (allow the current month
      // mid-month — attendance and leave data up to today is what gets paid).
      const startMs = new Date(`${monthStart}T00:00:00Z`).getTime();
      if (startMs > Date.now() + 26 * 3600 * 1000) {
        return { ok: false, error: "Cannot run payroll for a future month" };
      }

      const rules = await getCompanyRules(context);
      if (!rules) return { ok: false, error: "Office settings are missing — finish the setup wizard first" };
      const weekendDays = rules.weekend_days ?? ["Saturday", "Sunday"];
      const { data: holidays } = await supabase.from("public_holidays").select("holiday_date");
      const holidayDates = (holidays ?? []).map((h) => h.holiday_date);

      // Employees paid in this period (joined before month end, not exited before start)
      const { data: employees, error: empErr } = await supabase
        .from("employees")
        .select("id, full_name, employee_code, basic_salary, join_date, exit_date, user_id")
        .lte("join_date", monthEnd)
        .or(`exit_date.is.null,exit_date.gte.${monthStart}`);
      if (empErr) return { ok: false, error: "Could not load employees" };
      if (!employees || employees.length === 0) return { ok: false, error: "No employees to pay for this period" };

      // Attendance in the month
      const { data: attendance } = await supabase
        .from("attendance")
        .select("employee_id, status, work_date")
        .gte("work_date", monthStart)
        .lte("work_date", monthEnd);
      const byEmployee = new Map<string, { present: number; half: number; late: number }>();
      for (const a of attendance ?? []) {
        const s = byEmployee.get(a.employee_id) ?? { present: 0, half: 0, late: 0 };
        if (a.status === "present" || a.status === "late" || a.status === "missing_checkout") s.present += 1;
        if (a.status === "late") s.late += 1;
        if (a.status === "half_day") s.half += 1;
        byEmployee.set(a.employee_id, s);
      }

      // Approved leaves overlapping the month
      const { data: leaves } = await supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date, working_days, leave_types(is_paid)")
        .eq("status", "approved")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart);
      const paidDays = new Map<string, number>();
      const unpaidDays = new Map<string, number>();
      for (const l of leaves ?? []) {
        const isPaid = (l.leave_types as { is_paid: boolean } | null)?.is_paid ?? true;
        const s = isPaid ? paidDays : unpaidDays;
        // Clamped overlap in working days, proportional to full range
        const from = l.start_date > monthStart ? l.start_date : monthStart;
        const to = l.end_date < monthEnd ? l.end_date : monthEnd;
        const total = l.working_days || 1;
        const spanDays =
          Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000) + 1;
        const fullSpan =
          Math.round(
            (new Date(`${l.end_date}T12:00:00Z`).getTime() - new Date(`${l.start_date}T12:00:00Z`).getTime()) / 86400000,
          ) + 1;
        s.set(l.employee_id, (s.get(l.employee_id) ?? 0) + (total * spanDays) / fullSpan);
      }

      // A previous draft for the same period is replaced
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existingRuns } = await supabaseAdmin
        .from("payroll_runs")
        .select("id, status")
        .eq("period_year", year)
        .eq("period_month", month);
      for (const run of existingRuns ?? []) {
        if (run.status === "finalized") return { ok: false, error: `Payroll for ${MONTH_NAMES[month - 1]} ${year} is already finalized and locked` };
        await supabaseAdmin.from("payslips").delete().eq("run_id", run.id);
        await supabaseAdmin.from("payroll_runs").delete().eq("id", run.id);
      }

      const workingDays = workingDaysInMonth(year, month, weekendDays, holidayDates);
      const todayISO = new Date().toISOString().slice(0, 10);

      const { data: runRow, error: runErr } = await supabaseAdmin
        .from("payroll_runs")
        .insert({
          period_year: year,
          period_month: month,
          status: "draft",
          working_days: workingDays,
          created_by: userId,
        })
        .select("id")
        .single();
      if (runErr || !runRow) return { ok: false, error: "Could not create the payroll run" };

      let totalGross = 0;
      let totalNet = 0;
      const slips: {
        run_id: string;
        employee_id: string;
        basic_salary: number;
        gross_salary: number;
        working_days: number;
        present_days: number;
        absent_days: number;
        half_days: number;
        lates: number;
        unpaid_leave_days: number;
        per_day_rate: number;
        absence_deduction: number;
        late_deduction: number;
        tax: number;
        net_pay: number;
      }[] = [];

      for (const e of employees) {
        const eligible = eligibleWorkingDays(year, month, e.join_date, e.exit_date, weekendDays, holidayDates);
        if (eligible === 0) continue;
        const stats = byEmployee.get(e.id) ?? { present: 0, half: 0, late: 0 };
        const paidLeave = paidDays.get(e.id) ?? 0;
        const unpaid = unpaidDays.get(e.id) ?? 0;
        const presentDays = stats.present + paidLeave;

        // Elapsed eligible days (absence only counts for days already past)
        const elapsedTo = todayISO < monthEnd ? todayISO : monthEnd;
        const elapsedFrom = e.join_date > monthStart ? e.join_date : monthStart;
        let elapsed = 0;
        if (elapsedTo >= elapsedFrom) {
          const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const holidaySet = new Set(holidayDates);
          for (const d = new Date(`${elapsedFrom}T12:00:00Z`); d <= new Date(`${elapsedTo}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
            const wd = names[d.getUTCDay()] as string;
            if (weekendDays.includes(wd)) continue;
            if (holidaySet.has(d.toISOString().slice(0, 10))) continue;
            elapsed += 1;
          }
        }
        const absentDays = Math.max(0, Math.round((elapsed - presentDays - 0.5 * stats.half - unpaid) * 10) / 10);

        const math = computePayslip({
          basic: e.basic_salary,
          workingDays,
          eligibleDays: eligible,
          presentDays,
          absentDays,
          halfDays: stats.half,
          unpaidLeaveDays: unpaid,
          lates: stats.late,
          latePenaltyLates: rules.late_penalty_lates || 3,
          latePenaltyDays: rules.late_penalty_days || 0.5,
        });
        totalGross += math.gross;
        totalNet += math.netPay;
        slips.push({
          run_id: runRow.id as string,
          employee_id: e.id,
          basic_salary: math.basic,
          gross_salary: math.gross,
          working_days: workingDays,
          present_days: Math.round(presentDays * 10) / 10,
          absent_days: absentDays,
          half_days: stats.half,
          lates: stats.late,
          unpaid_leave_days: Math.round(unpaid * 10) / 10,
          per_day_rate: math.perDayRate,
          absence_deduction: math.absenceDeduction,
          late_deduction: math.lateDeduction,
          tax: math.tax,
          net_pay: math.netPay,
        });
      }

      if (slips.length === 0) {
        await supabaseAdmin.from("payroll_runs").delete().eq("id", runRow.id as string);
        return { ok: false, error: "No payable days found for any employee in this period" };
      }

      const { error: slipErr } = await supabaseAdmin.from("payslips").insert(slips);
      if (slipErr) {
        await supabaseAdmin.from("payroll_runs").delete().eq("id", runRow.id as string);
        return { ok: false, error: "Could not save the payslips" };
      }
      await supabaseAdmin
        .from("payroll_runs")
        .update({ total_gross: Math.round(totalGross * 100) / 100, total_net: Math.round(totalNet * 100) / 100 })
        .eq("id", runRow.id as string);

      await writeAudit(supabaseAdmin, {
        actorId: userId,
        actorEmail: await actorEmail(context),
        action: "payroll.draft_run",
        entity: "payroll_run",
        entityId: runRow.id as string,
        after: {
          period: `${MONTH_NAMES[month - 1]} ${year}`,
          working_days: workingDays,
          employees: slips.length,
          total_gross: Math.round(totalGross * 100) / 100,
          total_net: Math.round(totalNet * 100) / 100,
        },
      });

      return { ok: true, runId: runRow.id as string, employees: slips.length, totalNet: Math.round(totalNet * 100) / 100 };
    },
  );

// ---------- Finalize (Admin only, locks the run) ----------

export const finalizePayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => input)
  .handler(async ({ context, data }): Promise<SimpleResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: run } = await supabaseAdmin
      .from("payroll_runs")
      .select("id, status, period_year, period_month")
      .eq("id", data.runId)
      .maybeSingle();
    if (!run) return { ok: false, error: "Payroll run not found" };
    if (run.status === "finalized") return { ok: false, error: "This payroll run is already finalized and locked" };

    const { error } = await supabaseAdmin
      .from("payroll_runs")
      .update({ status: "finalized", finalized_at: new Date().toISOString(), finalized_by: userId })
      .eq("id", data.runId);
    if (error) return { ok: false, error: "Could not finalize the payroll run" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "payroll.finalize",
      entity: "payroll_run",
      entityId: data.runId,
      before: { status: run.status },
      after: { status: "finalized" },
    });

    // Notify employees with a payslip in this run
    const { data: slips } = await supabaseAdmin
      .from("payslips")
      .select("employee_id, net_pay")
      .eq("run_id", data.runId);
    const { data: emps } = await supabaseAdmin
      .from("employees")
      .select("id, user_id, full_name")
      .in(
        "id",
        (slips ?? []).map((s) => s.employee_id),
      );
    const byId = new Map((emps ?? []).map((e) => [e.id, e]));
    for (const s of slips ?? []) {
      const e = byId.get(s.employee_id);
      if (e?.user_id) {
        await notify(
          supabaseAdmin,
          e.user_id,
          "Payslip available",
          `Your payslip for ${MONTH_NAMES[(run.period_month as number) - 1]} ${run.period_year} is ready (net PKR ${s.net_pay.toLocaleString()}).`,
        );
      }
    }
    return { ok: true };
  });

// ---------- My payslips (employee) ----------

export const listMyPayslips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<(PayslipDto & { period_year: number; period_month: number; run_status: string })[]> => {
    const employeeId = await getOwnEmployeeId(context);
    if (!employeeId) return [];
    const { data, error } = await context.supabase
      .from("payslips")
      .select("*, payroll_runs(period_year, period_month, status)")
      .eq("employee_id", employeeId)
      .order("run_id", { ascending: false });
    if (error) throw new Error("Could not load your payslips");
    return (data ?? []).map((s) => {
      const run = (s as unknown as { payroll_runs: { period_year: number; period_month: number; status: string } | null })
        .payroll_runs;
      return {
        id: s.id,
        run_id: s.run_id,
        employee_id: s.employee_id,
        employee_name: null,
        employee_code: null,
        department_name: null,
        basic_salary: s.basic_salary,
        gross_salary: s.gross_salary,
        working_days: s.working_days,
        present_days: s.present_days,
        absent_days: s.absent_days,
        half_days: s.half_days,
        lates: s.lates,
        unpaid_leave_days: s.unpaid_leave_days,
        per_day_rate: s.per_day_rate,
        absence_deduction: s.absence_deduction,
        late_deduction: s.late_deduction,
        tax: s.tax,
        net_pay: s.net_pay,
        period_year: run?.period_year ?? 0,
        period_month: run?.period_month ?? 0,
        run_status: run?.status ?? "draft",
      };
    });
  });

// ---------- PDF payslip ----------

async function buildPayslipPdf(info: {
  companyName: string;
  period: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  slip: {
    basic_salary: number;
    gross_salary: number;
    working_days: number;
    present_days: number;
    absent_days: number;
    half_days: number;
    lates: number;
    unpaid_leave_days: number;
    per_day_rate: number;
    absence_deduction: number;
    late_deduction: number;
    tax: number;
    net_pay: number;
  };
  status: string;
}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const dark = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.45, 0.45, 0.5);

  const fmt = (n: number) => `PKR ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  page.drawText(info.companyName, { x: 50, y: 790, size: 20, font: bold, color: dark });
  page.drawText("Payslip", { x: 50, y: 768, size: 14, font: bold, color: muted });
  page.drawText(info.period, { x: 430, y: 790, size: 12, font: font, color: dark });
  if (info.status !== "finalized") {
    page.drawText("DRAFT — not finalized", { x: 400, y: 772, size: 10, font: bold, color: rgb(0.75, 0.3, 0.1) });
  }

  page.drawLine({
    start: { x: 50, y: 752 },
    end: { x: 545, y: 752 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.85),
  });

  let y = 720;
  const label = (t: string, v: string, b = false) => {
    page.drawText(t, { x: 50, y, size: 10, font: b ? bold : font, color: muted });
    page.drawText(v, { x: 300, y, size: 10, font: b ? bold : font, color: dark });
    y -= 18;
  };
  label("Employee", info.employeeName, true);
  label("Employee code", info.employeeCode);
  label("Department", info.department || "—");

  y -= 10;
  page.drawText("Earnings", { x: 50, y, size: 11, font: bold, color: dark });
  y -= 6;
  const bd = salaryBreakdown(info.slip.basic_salary);
  label("Basic salary", fmt(bd.basic));
  label("House rent allowance (40%)", fmt(bd.hra));
  label("Medical allowance (10%)", fmt(bd.medical));
  label("Gross salary", fmt(info.slip.gross_salary), true);
  label("Per-day rate", fmt(info.slip.per_day_rate));

  y -= 10;
  page.drawText("Attendance", { x: 50, y, size: 11, font: bold, color: dark });
  y -= 6;
  label("Working days", String(info.slip.working_days));
  label("Present days", String(info.slip.present_days));
  label("Absent days", String(info.slip.absent_days));
  label("Half days", String(info.slip.half_days));
  label("Late arrivals", String(info.slip.lates));
  label("Unpaid leave days", String(info.slip.unpaid_leave_days));

  y -= 10;
  page.drawText("Deductions & net", { x: 50, y, size: 11, font: bold, color: dark });
  y -= 6;
  label("Absence / unpaid / half-day deduction", `- ${fmt(info.slip.absence_deduction)}`);
  label("Late penalty deduction", `- ${fmt(info.slip.late_deduction)}`);
  label("Income tax", `- ${fmt(info.slip.tax)}`);

  y -= 12;
  page.drawRectangle({ x: 50, y: y - 8, width: 495, height: 28, color: rgb(0.93, 0.95, 0.99) });
  page.drawText("NET PAY", { x: 60, y, size: 12, font: bold, color: dark });
  page.drawText(fmt(info.slip.net_pay), { x: 430, y, size: 12, font: bold, color: dark });

  y -= 40;
  page.drawText("This is a system-generated payslip from HCM Lite.", { x: 50, y, size: 8, font: font, color: muted });

  return doc.save();
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const getPayslipPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string; employeeId?: string | undefined }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true; filename: string; base64: string } | { ok: false; error: string }> => {
    const held = await requireAnyRole(context, "employee", "hr", "admin");
    const isPrivileged = held.includes("hr") || held.includes("admin");

    let targetEmployeeId = data.employeeId ?? null;
    if (!isPrivileged) {
      const own = await getOwnEmployeeId(context);
      if (!own) return { ok: false, error: "No employee profile is linked to your account" };
      if (targetEmployeeId && targetEmployeeId !== own) return { ok: false, error: "Forbidden: you can only download your own payslip" };
      targetEmployeeId = own;
    }
    if (!targetEmployeeId) return { ok: false, error: "employeeId is required" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: slip } = await supabaseAdmin
      .from("payslips")
      .select("*, employees(full_name, employee_code, departments(name)), payroll_runs(period_year, period_month, status)")
      .eq("run_id", data.runId)
      .eq("employee_id", targetEmployeeId)
      .maybeSingle();
    if (!slip) return { ok: false, error: "Payslip not found" };

    const emp = (
      slip as unknown as {
        employees: { full_name: string; employee_code: string; departments: { name: string } | null } | null;
        payroll_runs: { period_year: number; period_month: number; status: string } | null;
      }
    );
    const run = emp.payroll_runs;
    const { data: company } = await supabaseAdmin.from("companies").select("name").limit(1).maybeSingle();

    const period = run ? `${MONTH_NAMES[run.period_month - 1]} ${run.period_year}` : "";
    const bytes = await buildPayslipPdf({
      companyName: company?.name ?? "HCM Lite",
      period,
      employeeName: emp.employees?.full_name ?? "",
      employeeCode: emp.employees?.employee_code ?? "",
      department: emp.employees?.departments?.name ?? "",
      slip: {
        basic_salary: slip.basic_salary,
        gross_salary: slip.gross_salary,
        working_days: slip.working_days,
        present_days: slip.present_days,
        absent_days: slip.absent_days,
        half_days: slip.half_days,
        lates: slip.lates,
        unpaid_leave_days: slip.unpaid_leave_days,
        per_day_rate: slip.per_day_rate,
        absence_deduction: slip.absence_deduction,
        late_deduction: slip.late_deduction,
        tax: slip.tax,
        net_pay: slip.net_pay,
      },
      status: run?.status ?? "draft",
    });

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      actorEmail: await actorEmail(context),
      action: "payslip.download",
      entity: "payslip",
      entityId: slip.id,
      after: { run_id: data.runId, employee_id: targetEmployeeId },
    });

    const safeName = `${period.replace(/\s+/g, "_")}_payslip.pdf`;
    return { ok: true, filename: safeName, base64: toBase64(bytes) };
  });
