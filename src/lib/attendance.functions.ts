import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyRole, type AuthedContext } from "@/lib/rbac.server";
import { writeAudit } from "@/lib/audit.server";
import {
  checkInStatus,
  dayBoardStatus,
  finalStatusAfterCheckout,
  haversineMeters,
  isWeekend,
  pktStamp,
} from "@/lib/rules/attendance-rules";

// ---------- Types (client-safe) ----------

export interface CompanyRules {
  office_start: string;
  grace_minutes: number;
  half_day_hours: number;
  weekend_days: string[];
  office_lat: number;
  office_lng: number;
  geofence_radius_m: number;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  distance_m: number | null;
  check_method: string;
}

export type CheckResult =
  | { ok: true; status: string; time: string; distanceM: number | null }
  | { ok: false; code: number; error: string };

type SimpleResult = { ok: true } | { ok: false; error: string };

export interface DayBoardRow {
  employeeId: string;
  code: string;
  name: string;
  department: string | null;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  distanceM: number | null;
}

export interface CorrectionRow {
  id: string;
  employee_id: string;
  employee_name: string | null;
  work_date: string;
  field: string;
  requested_time: string;
  reason: string;
  status: string;
  decision_comment: string | null;
  created_at: string;
}

// ---------- helpers ----------

async function getOwnEmployeeId(context: AuthedContext): Promise<string | null> {
  const { data } = await context.supabase
    .from("employees")
    .select("id")
    .eq("user_id", context.userId)
    .maybeSingle();
  return data?.id ?? null;
}

async function getCompanyRules(context: AuthedContext): Promise<CompanyRules | null> {
  const { data } = await context.supabase
    .from("companies")
    .select(
      "office_start, grace_minutes, half_day_hours, weekend_days, office_lat, office_lng, geofence_radius_m",
    )
    .limit(1)
    .maybeSingle();
  return (data as CompanyRules | null) ?? null;
}

async function actorEmail(context: AuthedContext): Promise<string | null> {
  const { data } = await context.supabase.auth.getUser();
  return data.user?.email ?? null;
}

// ---------- Check-in (Employee, HR and Admin all check themselves in) ----------

export const checkIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      lat?: number | null;
      lng?: number | null;
      accuracyM?: number | null;
      faceOk?: boolean;
      checkMethod?: string;
    }) => input,
  )
  .handler(async ({ context, data }): Promise<CheckResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "employee", "hr", "admin");

    const employeeId = await getOwnEmployeeId(context);
    if (!employeeId) return { ok: false, code: 400, error: "No employee profile is linked to your account" };

    const rules = await getCompanyRules(context);
    if (!rules) return { ok: false, code: 500, error: "Office settings are missing — finish the setup wizard" };

    const now = new Date();
    const stamp = pktStamp(now);

    // One record per employee per day — a second check-in is a 409 conflict.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("attendance")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("work_date", stamp.date)
      .maybeSingle();
    if (existing) {
      return { ok: false, code: 409, error: `You have already checked in today (${stamp.time}). One check-in per day.` };
    }

    const status = checkInStatus(stamp, rules.office_start, rules.grace_minutes);

    const lat = typeof data.lat === "number" ? data.lat : null;
    const lng = typeof data.lng === "number" ? data.lng : null;
    const distanceM =
      lat !== null && lng !== null ? haversineMeters(lat, lng, rules.office_lat, rules.office_lng) : null;

    // Camera verification: if the widget was used and no face was seen, refuse.
    if (data.faceOk === false) {
      return { ok: false, code: 422, error: "No face detected in front of the camera — sit in frame and try again" };
    }

    const checkMethod =
      data.faceOk === true && lat !== null
        ? "webcam+gps"
        : data.faceOk === true
          ? "webcam"
          : lat !== null
            ? "gps"
            : "web";

    const { data: record, error } = await supabaseAdmin
      .from("attendance")
      .insert({
        employee_id: employeeId,
        work_date: stamp.date,
        check_in: now.toISOString(),
        status,
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_accuracy_m: typeof data.accuracyM === "number" ? data.accuracyM : null,
        distance_m: distanceM,
        check_method: checkMethod,
      })
      .select("id")
      .single();
    if (error || !record) return { ok: false, code: 500, error: "Could not save your check-in" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "attendance.check_in",
      entity: "attendance",
      entityId: record.id as string,
      after: { work_date: stamp.date, time: stamp.time, status, distance_m: distanceM },
    });

    return { ok: true, status, time: stamp.time, distanceM };
  });

// ---------- Check-out ----------

export const checkOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { lat?: number | null; lng?: number | null; accuracyM?: number | null }) => input,
  )
  .handler(async ({ context, data }): Promise<CheckResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "employee", "hr", "admin");

    const employeeId = await getOwnEmployeeId(context);
    if (!employeeId) return { ok: false, code: 400, error: "No employee profile is linked to your account" };

    const rules = await getCompanyRules(context);
    if (!rules) return { ok: false, code: 500, error: "Office settings are missing — finish the setup wizard" };

    const now = new Date();
    const stamp = pktStamp(now);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: record } = await supabaseAdmin
      .from("attendance")
      .select("id, check_in, check_out, status")
      .eq("employee_id", employeeId)
      .eq("work_date", stamp.date)
      .maybeSingle();

    if (!record) return { ok: false, code: 404, error: "No check-in found for today — check in first" };
    if (record.check_out) {
      return { ok: false, code: 409, error: "You have already checked out today" };
    }

    const workedHours = (now.getTime() - new Date(record.check_in as string).getTime()) / 3600000;
    const status = finalStatusAfterCheckout(workedHours, rules.half_day_hours, record.status as string);

    const lat = typeof data.lat === "number" ? data.lat : null;
    const lng = typeof data.lng === "number" ? data.lng : null;

    const { error } = await supabaseAdmin
      .from("attendance")
      .update({
        check_out: now.toISOString(),
        check_out_lat: lat,
        check_out_lng: lng,
        check_out_accuracy_m: typeof data.accuracyM === "number" ? data.accuracyM : null,
        status,
      })
      .eq("id", record.id as string);
    if (error) return { ok: false, code: 500, error: "Could not save your check-out" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "attendance.check_out",
      entity: "attendance",
      entityId: record.id as string,
      before: { status: record.status },
      after: { check_out: now.toISOString(), status, worked_hours: Math.round(workedHours * 10) / 10 },
    });

    return { ok: true, status, time: stamp.time, distanceM: null };
  });

// ---------- My attendance ----------

export const getMyToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ record: AttendanceRecord | null; weekend: boolean; weekday: string }> => {
    const employeeId = await getOwnEmployeeId(context);
    const stamp = pktStamp(new Date());
    if (!employeeId) return { record: null, weekend: false, weekday: stamp.weekday };

    const rules = await getCompanyRules(context);
    const { data } = await context.supabase
      .from("attendance")
      .select("id, employee_id, work_date, check_in, check_out, status, distance_m, check_method")
      .eq("employee_id", employeeId)
      .eq("work_date", stamp.date)
      .maybeSingle();

    return {
      record: (data as AttendanceRecord | null) ?? null,
      weekend: rules ? isWeekend(stamp.weekday, rules.weekend_days) : false,
      weekday: stamp.weekday,
    };
  });

export const getMyAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string }) => input)
  .handler(async ({ context, data }): Promise<AttendanceRecord[]> => {
    const employeeId = await getOwnEmployeeId(context);
    if (!employeeId) return [];
    const { data: rows, error } = await context.supabase
      .from("attendance")
      .select("id, employee_id, work_date, check_in, check_out, status, distance_m, check_method")
      .eq("employee_id", employeeId)
      .gte("work_date", data.from)
      .lte("work_date", data.to)
      .order("work_date", { ascending: false });
    if (error) throw new Error("Could not load your attendance");
    return (rows as AttendanceRecord[]) ?? [];
  });

// ---------- Daily attendance board (HR/Admin) ----------

export const getDayBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { date: string }) => input)
  .handler(async ({ context, data }): Promise<DayBoardRow[]> => {
    await requireAnyRole(context, "hr", "admin");
    const { supabase } = context;

    const { data: employees, error } = await supabase
      .from("employees")
      .select("id, employee_code, full_name, departments(name)")
      .eq("status", "active")
      .order("full_name");
    if (error) throw new Error("Could not load employees");

    const { data: records } = await supabase
      .from("attendance")
      .select("employee_id, check_in, check_out, status, distance_m")
      .eq("work_date", data.date);

    const byEmployee = new Map((records ?? []).map((r) => [r.employee_id, r]));

    return (employees ?? []).map((e) => {
      const record = byEmployee.get(e.id) ?? null;
      return {
        employeeId: e.id,
        code: e.employee_code,
        name: e.full_name,
        department: e.departments?.name ?? null,
        checkIn: record?.check_in ?? null,
        checkOut: record?.check_out ?? null,
        status: dayBoardStatus(record ? { status: record.status, check_out: record.check_out } : null),
        distanceM: record?.distance_m ?? null,
      };
    });
  });

// ---------- Attendance corrections ----------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const requestCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workDate: string; field: string; time: string; reason: string }) => input)
  .handler(async ({ context, data }): Promise<SimpleResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "employee", "hr", "admin");

    const employeeId = await getOwnEmployeeId(context);
    if (!employeeId) return { ok: false, error: "No employee profile is linked to your account" };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.workDate)) return { ok: false, error: "Use a valid date (YYYY-MM-DD)" };
    if (!["check_in", "check_out"].includes(data.field)) return { ok: false, error: "Field must be check-in or check-out" };
    if (!TIME_RE.test(data.time)) return { ok: false, error: "Use a valid time (HH:MM)" };
    if (!data.reason || data.reason.trim().length < 5) return { ok: false, error: "Please give a short reason (at least 5 characters)" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending } = await supabaseAdmin
      .from("attendance_corrections")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("work_date", data.workDate)
      .eq("field", data.field)
      .eq("status", "pending")
      .maybeSingle();
    if (pending) return { ok: false, error: "A correction for this day and field is already pending" };

    const requestedTime = `${data.workDate}T${data.time}:00+05:00`;
    const { error } = await supabaseAdmin.from("attendance_corrections").insert({
      employee_id: employeeId,
      work_date: data.workDate,
      field: data.field,
      requested_time: requestedTime,
      reason: data.reason.trim(),
      status: "pending",
    });
    if (error) return { ok: false, error: "Could not submit your correction request" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "correction.request",
      entity: "attendance_correction",
      entityId: null,
      after: { work_date: data.workDate, field: data.field, time: data.time, reason: data.reason.trim() },
    });
    return { ok: true };
  });

interface CorrectionRecordRow {
  id: string;
  employee_id: string;
  work_date: string;
  field: string;
  requested_time: string;
  reason: string;
  status: string;
  decision_comment: string | null;
  created_at: string;
  employees: { full_name: string } | null;
}

function mapCorrection(r: CorrectionRecordRow): CorrectionRow {
  return {
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employees?.full_name ?? null,
    work_date: r.work_date,
    field: r.field,
    requested_time: r.requested_time,
    reason: r.reason,
    status: r.status,
    decision_comment: r.decision_comment,
    created_at: r.created_at,
  };
}


export const listMyCorrections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CorrectionRow[]> => {
    const employeeId = await getOwnEmployeeId(context);
    if (!employeeId) return [];
    const { data, error } = await context.supabase
      .from("attendance_corrections")
      .select("id, employee_id, work_date, field, requested_time, reason, status, decision_comment, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Could not load your correction requests");
    return (data as CorrectionRow[]) ?? [];
  });

export const listAllCorrections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CorrectionRow[]> => {
    await requireAnyRole(context, "hr", "admin");
    const { data, error } = await context.supabase
      .from("attendance_corrections")
      .select(
        "id, employee_id, work_date, field, requested_time, reason, status, decision_comment, created_at, employees(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Could not load correction requests");
    return (data ?? []).map((r) => mapCorrection(r as unknown as CorrectionRecordRow));
  });

export const decideCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; decision: "approved" | "rejected"; comment?: string }) => input)
  .handler(async ({ context, data }): Promise<SimpleResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "hr", "admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("attendance_corrections")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!before) return { ok: false, error: "Correction request not found" };
    if (before.status !== "pending") return { ok: false, error: "This request has already been decided" };

    const { error } = await supabaseAdmin
      .from("attendance_corrections")
      .update({
        status: data.decision,
        decided_by: userId,
        decision_comment: data.comment?.trim() || null,
      })
      .eq("id", data.id);
    if (error) return { ok: false, error: "Could not save the decision" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: `correction.${data.decision}`,
      entity: "attendance_correction",
      entityId: data.id,
      before: { status: before.status },
      after: { status: data.decision, comment: data.comment?.trim() || null },
    });
    return { ok: true };
  });
