import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyRole } from "@/lib/rbac.server";
import { writeAudit } from "@/lib/audit.server";
import { actorEmail, ensureOwnEmployeeProfile, getOwnEmployeeId, notify, userIdsWithRole } from "@/lib/helpers.server";
import { usedDaysInYear, validateLeaveRequest } from "@/lib/rules/leave-rules";

// ---------- Types (client-safe) ----------

export interface LeaveBalance {
  leaveTypeId: string;
  name: string;
  quota: number | null; // null = unlimited
  isPaid: boolean;
  used: number;
  pending: number;
  remaining: number | null;
}

export interface LeaveRow {
  id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  leave_type_id: string;
  type_name: string;
  is_paid: boolean;
  start_date: string;
  end_date: string;
  working_days: number;
  reason: string;
  status: string;
  decision_comment: string | null;
  created_at: string;
}

export type LeaveResult =
  | { ok: true; id: string; workingDays: number }
  | { ok: false; code: number; error: string };

type SimpleResult = { ok: true } | { ok: false; error: string };

interface LeaveRequestRecordRow {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  working_days: number;
  reason: string;
  status: string;
  decision_comment: string | null;
  created_at: string;
  leave_types: { name: string; is_paid: boolean } | null;
  employees: { full_name: string; employee_code: string } | null;
}

function mapLeave(r: LeaveRequestRecordRow): LeaveRow {
  return {
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employees?.full_name ?? null,
    employee_code: r.employees?.employee_code ?? null,
    leave_type_id: r.leave_type_id,
    type_name: r.leave_types?.name ?? "",
    is_paid: r.leave_types?.is_paid ?? true,
    start_date: r.start_date,
    end_date: r.end_date,
    working_days: r.working_days,
    reason: r.reason,
    status: r.status,
    decision_comment: r.decision_comment,
    created_at: r.created_at,
  };
}

const SELECT_LEAVES =
  "id, employee_id, leave_type_id, start_date, end_date, working_days, reason, status, decision_comment, created_at, leave_types(name, is_paid), employees(full_name, employee_code)";

// ---------- Balances ----------

export const getMyLeaveBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ balances: LeaveBalance[]; hasEmployeeProfile: boolean }> => {
    const employeeId = await getOwnEmployeeId(context);
    if (!employeeId) return { balances: [], hasEmployeeProfile: false };

    const year = new Date().getFullYear();
    const [ltRes, leaveRes] = await Promise.all([
      context.supabase.from("leave_types").select("id, name, annual_quota, is_paid").order("name"),
      context.supabase
        .from("leave_requests")
        .select("start_date, working_days, status, leave_type_id")
        .eq("employee_id", employeeId)
        .gte("start_date", `${year}-01-01`)
        .lte("start_date", `${year}-12-31`),
    ]);
    if (ltRes.error) throw new Error("Could not load leave types");
    const rows = leaveRes.data ?? [];

    const balances: LeaveBalance[] = (ltRes.data ?? []).map((t) => {
      const mine = rows.filter((r) => r.leave_type_id === t.id);
      const used = mine
        .filter((r) => r.status === "approved")
        .reduce((s, r) => s + r.working_days, 0);
      const pending = mine
        .filter((r) => r.status === "pending")
        .reduce((s, r) => s + r.working_days, 0);
      return {
        leaveTypeId: t.id,
        name: t.name,
        quota: t.annual_quota === null ? null : Number(t.annual_quota),
        isPaid: t.is_paid,
        used,
        pending,
        remaining: t.annual_quota === null ? null : Math.max(0, Number(t.annual_quota) - used - pending),
      };
    });
    return { balances, hasEmployeeProfile: true };
  });

// ---------- Apply ----------

export const applyLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { leaveTypeId: string; startDate: string; endDate: string; reason: string }) => input,
  )
  .handler(async ({ context, data }): Promise<LeaveResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "employee", "hr", "admin");
    // Never block leave requests on a missing profile: auto-create + link one.
    const employeeId = await ensureOwnEmployeeProfile(context);
    if (!employeeId) return { ok: false, code: 400, error: "Could not link an employee profile to your account" };

    const reason = data.reason.trim();
    if (reason.length < 5) return { ok: false, code: 422, error: "Please give a short reason (at least 5 characters)" };

    // Company rules + holidays
    const { data: company } = await supabase.from("companies").select("weekend_days").limit(1).maybeSingle();
    const weekendDays = (company?.weekend_days as string[] | undefined) ?? ["Saturday", "Sunday"];
    const { data: holidays } = await supabase.from("public_holidays").select("holiday_date");
    const holidayDates = (holidays ?? []).map((h) => h.holiday_date);

    // Leave type + quota
    const { data: leaveType } = await supabase
      .from("leave_types")
      .select("id, name, annual_quota, is_paid")
      .eq("id", data.leaveTypeId)
      .maybeSingle();
    if (!leaveType) return { ok: false, code: 422, error: "Unknown leave type" };

    // Existing pending + approved leaves for overlap and quota
    const { data: existing } = await supabase
      .from("leave_requests")
      .select("start_date, end_date, working_days, status, leave_type_id")
      .eq("employee_id", employeeId)
      .in("status", ["pending", "approved"]);
    const existingRows = existing ?? [];

    const year = Number(data.startDate.slice(0, 4));
    const alreadyUsed = usedDaysInYear(
      existingRows
        .filter((r) => r.status === "approved" && r.leave_type_id === leaveType.id)
        .map((r) => ({ start_date: r.start_date, end_date: r.end_date, working_days: r.working_days })),
      year,
    );

    const validation = validateLeaveRequest({
      startDate: data.startDate,
      endDate: data.endDate,
      weekendDays,
      holidays: holidayDates,
      quota: leaveType.annual_quota === null ? null : Number(leaveType.annual_quota),
      alreadyUsed,
      pendingOverlap: existingRows.map((r) => ({
        start_date: r.start_date,
        end_date: r.end_date,
        working_days: r.working_days,
      })),
    });
    if (!validation.ok) return { ok: false, code: validation.code, error: validation.error };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        employee_id: employeeId,
        leave_type_id: leaveType.id,
        start_date: data.startDate,
        end_date: data.endDate,
        working_days: validation.workingDays,
        reason,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, code: 500, error: "Could not submit the leave request" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "leave.apply",
      entity: "leave_request",
      entityId: created.id as string,
      after: {
        type: leaveType.name,
        start_date: data.startDate,
        end_date: data.endDate,
        working_days: validation.workingDays,
        reason,
      },
    });

    // Notify HR/Admin approvers
    const approvers = await userIdsWithRole(context, ["hr", "admin"]);
    const { data: me } = await supabase
      .from("employees")
      .select("full_name")
      .eq("id", employeeId)
      .maybeSingle();
    for (const uid of approvers) {
      await notify(
        supabaseAdmin,
        uid,
        "New leave request",
        `${me?.full_name ?? "An employee"} requested ${leaveType.name} (${validation.workingDays} day${validation.workingDays === 1 ? "" : "s"}, ${data.startDate} → ${data.endDate}).`,
      );
    }

    return { ok: true, id: created.id as string, workingDays: validation.workingDays };
  });

// ---------- Cancel (own pending) ----------

export const cancelLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }): Promise<SimpleResult> => {
    const { userId } = context;
    await requireAnyRole(context, "employee", "hr", "admin");
    const employeeId = await getOwnEmployeeId(context);
    if (!employeeId) return { ok: false, error: "No employee profile is linked to your account" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("leave_requests")
      .select("id, status")
      .eq("id", data.id)
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (!before) return { ok: false, error: "Leave request not found" };
    if (before.status !== "pending") return { ok: false, error: "Only pending requests can be cancelled" };

    const { error } = await supabaseAdmin.from("leave_requests").delete().eq("id", data.id);
    if (error) return { ok: false, error: "Could not cancel the request" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "leave.cancel",
      entity: "leave_request",
      entityId: data.id,
      before: { status: before.status },
    });
    return { ok: true };
  });

// ---------- Lists ----------

export const listMyLeaves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaveRow[]> => {
    const employeeId = await getOwnEmployeeId(context);
    if (!employeeId) return [];
    const { data, error } = await context.supabase
      .from("leave_requests")
      .select(SELECT_LEAVES)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Could not load your leave requests");
    return (data as unknown as LeaveRequestRecordRow[]).map(mapLeave);
  });

export const listLeaveInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaveRow[]> => {
    await requireAnyRole(context, "hr", "admin");
    const { data, error } = await context.supabase
      .from("leave_requests")
      .select(SELECT_LEAVES)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Could not load leave requests");
    return (data as unknown as LeaveRequestRecordRow[]).map(mapLeave);
  });

// ---------- HR/Admin decision ----------

export const decideLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; decision: "approved" | "rejected"; comment?: string }) => input)
  .handler(async ({ context, data }): Promise<SimpleResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "hr", "admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("leave_requests")
      .select("id, status, employee_id, working_days, start_date, end_date")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) return { ok: false, error: "Leave request not found" };
    if (before.status !== "pending") return { ok: false, error: "This request has already been decided" };

    const { error } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status: data.decision,
        decided_by: userId,
        decided_at: new Date().toISOString(),
        decision_comment: data.comment?.trim() || null,
      })
      .eq("id", data.id);
    if (error) return { ok: false, error: "Could not save the decision" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: `leave.${data.decision}`,
      entity: "leave_request",
      entityId: data.id,
      before: { status: before.status },
      after: { status: data.decision, comment: data.comment?.trim() || null },
    });

    // Notify the employee
    const { data: emp } = await supabase
      .from("employees")
      .select("user_id, full_name")
      .eq("id", before.employee_id)
      .maybeSingle();
    if (emp?.user_id) {
      await notify(
        supabaseAdmin,
        emp.user_id,
        `Leave ${data.decision}`,
        `Your leave ${before.start_date} → ${before.end_date} was ${data.decision}.${data.comment?.trim() ? ` Comment: ${data.comment.trim()}` : ""}`,
      );
    }
    void emp;
    return { ok: true };
  });
