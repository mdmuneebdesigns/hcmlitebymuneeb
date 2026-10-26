import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyRole, type AuthedContext } from "@/lib/rbac.server";
import { writeAudit } from "@/lib/audit.server";

// ---------- Types (client-safe) ----------

export interface CompanySettings {
  id: string;
  name: string;
  office_start: string;
  grace_minutes: number;
  half_day_hours: number;
  weekend_days: string[];
  office_lat: number;
  office_lng: number;
  geofence_radius_m: number;
}

export interface DepartmentDto {
  id: string;
  name: string;
}

export interface DesignationDto {
  id: string;
  name: string;
  department_id: string | null;
  department_name: string | null;
}

export interface LeaveTypeDto {
  id: string;
  name: string;
  annual_quota: number;
  is_paid: boolean;
}

export interface HolidayDto {
  id: string;
  holiday_date: string;
  name: string;
}

export interface OrgData {
  company: CompanySettings | null;
  departments: DepartmentDto[];
  designations: DesignationDto[];
  leaveTypes: LeaveTypeDto[];
  holidays: HolidayDto[];
}

type WriteResult = { ok: true } | { ok: false; error: string };


// ---------- Reads ----------

export const getOrgData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgData> => {
    const { supabase } = context;
    const [companyRes, deptRes, desigRes, ltRes, holidayRes] = await Promise.all([
      supabase.from("companies").select("*").limit(1).maybeSingle(),
      supabase.from("departments").select("id, name").order("name"),
      supabase
        .from("designations")
        .select("id, name, department_id, departments(name)")
        .order("name"),
      supabase.from("leave_types").select("id, name, annual_quota, is_paid").order("name"),
      supabase.from("public_holidays").select("id, holiday_date, name").order("holiday_date"),
    ]);
    if (deptRes.error || desigRes.error || ltRes.error || holidayRes.error) {
      throw new Error("Could not load organization data");
    }
    return {
      company: (companyRes.data as CompanySettings | null) ?? null,
      departments: deptRes.data ?? [],
      designations: (desigRes.data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        department_id: d.department_id,
        department_name: d.departments?.name ?? null,
      })),
      leaveTypes: ltRes.data ?? [],
      holidays: holidayRes.data ?? [],
    };
  });

// ---------- Departments (Admin only) ----------

export const createDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    const held = await requireAnyRole(context, "admin");
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "Department name is too short" };

    const { data: created, error } = await supabase
      .from("departments")
      .insert({ name })
      .select("id")
      .single();
    if (error) return { ok: false, error: friendly(error, "Could not create the department") };

    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "department.create",
      entity: "department",
      entityId: created?.id,
      after: { name },
    });
    void held;
    return { ok: true };
  });

export const updateDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "Department name is too short" };

    const { data: before } = await supabase
      .from("departments")
      .select("name")
      .eq("id", data.id)
      .single();
    const { error } = await supabase.from("departments").update({ name }).eq("id", data.id);
    if (error) return { ok: false, error: friendly(error, "Could not update the department") };

    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "department.update",
      entity: "department",
      entityId: data.id,
      before: { name: before?.name ?? null },
      after: { name },
    });
    return { ok: true };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const { data: before } = await supabase
      .from("departments")
      .select("name")
      .eq("id", data.id)
      .single();
    const { error } = await supabase.from("departments").delete().eq("id", data.id);
    if (error) {
      return {
        ok: false,
        error: "This department is still used by employees or designations, so it cannot be deleted.",
      };
    }
    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "department.delete",
      entity: "department",
      entityId: data.id,
      before: { name: before?.name ?? null },
    });
    return { ok: true };
  });

// ---------- Designations (Admin only) ----------

export const createDesignation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; departmentId: string | null }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "Designation name is too short" };

    const { data: created, error } = await supabase
      .from("designations")
      .insert({ name, department_id: data.departmentId })
      .select("id")
      .single();
    if (error) return { ok: false, error: friendly(error, "Could not create the designation") };

    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "designation.create",
      entity: "designation",
      entityId: created?.id,
      after: { name, department_id: data.departmentId },
    });
    return { ok: true };
  });

export const updateDesignation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string; departmentId: string | null }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "Designation name is too short" };

    const { data: before } = await supabase
      .from("designations")
      .select("name, department_id")
      .eq("id", data.id)
      .single();
    const { error } = await supabase
      .from("designations")
      .update({ name, department_id: data.departmentId })
      .eq("id", data.id);
    if (error) return { ok: false, error: friendly(error, "Could not update the designation") };

    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "designation.update",
      entity: "designation",
      entityId: data.id,
      before: { name: before?.name ?? null, department_id: before?.department_id ?? null },
      after: { name, department_id: data.departmentId },
    });
    return { ok: true };
  });

export const deleteDesignation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const { data: before } = await supabase
      .from("designations")
      .select("name")
      .eq("id", data.id)
      .single();
    const { error } = await supabase.from("designations").delete().eq("id", data.id);
    if (error) {
      return { ok: false, error: "This designation is still used by employees, so it cannot be deleted." };
    }
    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "designation.delete",
      entity: "designation",
      entityId: data.id,
      before: { name: before?.name ?? null },
    });
    return { ok: true };
  });

// ---------- Leave types (Admin only) ----------

export const createLeaveType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; annualQuota: number; isPaid: boolean }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "Leave type name is too short" };
    if (!Number.isFinite(data.annualQuota) || data.annualQuota < 0) {
      return { ok: false, error: "Annual quota must be 0 or more" };
    }

    const { data: created, error } = await supabase
      .from("leave_types")
      .insert({ name, annual_quota: data.annualQuota, is_paid: data.isPaid })
      .select("id")
      .single();
    if (error) return { ok: false, error: friendly(error, "Could not create the leave type") };

    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "leave_type.create",
      entity: "leave_type",
      entityId: created?.id,
      after: { name, annual_quota: data.annualQuota, is_paid: data.isPaid },
    });
    return { ok: true };
  });

export const updateLeaveType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string; annualQuota: number; isPaid: boolean }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "Leave type name is too short" };
    if (!Number.isFinite(data.annualQuota) || data.annualQuota < 0) {
      return { ok: false, error: "Annual quota must be 0 or more" };
    }

    const { data: before } = await supabase
      .from("leave_types")
      .select("name, annual_quota, is_paid")
      .eq("id", data.id)
      .single();
    const { error } = await supabase
      .from("leave_types")
      .update({ name, annual_quota: data.annualQuota, is_paid: data.isPaid })
      .eq("id", data.id);
    if (error) return { ok: false, error: friendly(error, "Could not update the leave type") };

    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "leave_type.update",
      entity: "leave_type",
      entityId: data.id,
      before: {
        name: before?.name ?? null,
        annual_quota: before?.annual_quota ?? null,
        is_paid: before?.is_paid ?? null,
      },
      after: { name, annual_quota: data.annualQuota, is_paid: data.isPaid },
    });
    return { ok: true };
  });

export const deleteLeaveType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const { data: before } = await supabase
      .from("leave_types")
      .select("name")
      .eq("id", data.id)
      .single();
    const { error } = await supabase.from("leave_types").delete().eq("id", data.id);
    if (error) {
      return { ok: false, error: "This leave type is referenced by leave requests, so it cannot be deleted." };
    }
    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "leave_type.delete",
      entity: "leave_type",
      entityId: data.id,
      before: { name: before?.name ?? null },
    });
    return { ok: true };
  });

// ---------- Public holidays (Admin only) ----------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const createHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { holidayDate: string; name: string }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "Holiday name is too short" };
    if (!ISO_DATE_RE.test(data.holidayDate)) return { ok: false, error: "Use a valid date (YYYY-MM-DD)" };

    const { data: created, error } = await supabase
      .from("public_holidays")
      .insert({ holiday_date: data.holidayDate, name })
      .select("id")
      .single();
    if (error) return { ok: false, error: friendly(error, "Could not add the holiday") };

    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "holiday.create",
      entity: "public_holiday",
      entityId: created?.id,
      after: { holiday_date: data.holidayDate, name },
    });
    return { ok: true };
  });

export const deleteHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");
    const { data: before } = await supabase
      .from("public_holidays")
      .select("name, holiday_date")
      .eq("id", data.id)
      .single();
    const { error } = await supabase.from("public_holidays").delete().eq("id", data.id);
    if (error) return { ok: false, error: "Could not remove the holiday" };
    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "holiday.delete",
      entity: "public_holiday",
      entityId: data.id,
      before: { name: before?.name ?? null, holiday_date: before?.holiday_date ?? null },
    });
    return { ok: true };
  });

// ---------- Office settings (Admin only; RLS also enforces) ----------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Accepts "9:5"? no — accepts "HH:MM", "H:MM" and "HH:MM:SS" (Postgres time text)
// and always returns "HH:MM"; anything else comes back unchanged (invalid).
export function normalizeOfficeStart(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(s);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s;
}

export interface CompanySettingsInput {
  name: string;
  officeStart: string;
  graceMinutes: number;
  halfDayHours: number;
  weekendDays: string[];
  officeLat: number;
  officeLng: number;
  geofenceRadiusM: number;
}

export const updateCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<CompanySettingsInput>) => input)
  .handler(async ({ context, data }): Promise<WriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");

    const errors: string[] = [];
    // The companies.office_start column is a Postgres time, which can come back
    // as "HH:MM:SS" — normalize to HH:MM before validating.
    const officeStart = normalizeOfficeStart(data.officeStart);
    if (!data.name || data.name.trim().length < 2) errors.push("Company name is required");
    if (!officeStart || !TIME_RE.test(officeStart)) errors.push("Office start must be HH:MM");
    if (typeof data.graceMinutes !== "number" || data.graceMinutes < 0 || data.graceMinutes > 120)
      errors.push("Grace time must be 0–120 minutes");
    if (typeof data.halfDayHours !== "number" || data.halfDayHours < 1 || data.halfDayHours > 8)
      errors.push("Half-day threshold must be 1–8 hours");
    if (
      !Array.isArray(data.weekendDays) ||
      data.weekendDays.length === 0 ||
      data.weekendDays.some((d) => !WEEKDAYS.includes(d))
    )
      errors.push("Select at least one weekend day");
    if (typeof data.officeLat !== "number" || data.officeLat < -90 || data.officeLat > 90)
      errors.push("Office latitude is invalid");
    if (typeof data.officeLng !== "number" || data.officeLng < -180 || data.officeLng > 180)
      errors.push("Office longitude is invalid");
    if (typeof data.geofenceRadiusM !== "number" || data.geofenceRadiusM < 10 || data.geofenceRadiusM > 10000)
      errors.push("Geofence radius must be 10–10000 m");
    if (errors.length > 0) return { ok: false, error: errors[0] as string };

    const patch = {
      name: (data.name as string).trim(),
      office_start: officeStart,
      grace_minutes: data.graceMinutes as number,
      half_day_hours: data.halfDayHours as number,
      weekend_days: data.weekendDays as string[],
      office_lat: data.officeLat as number,
      office_lng: data.officeLng as number,
      geofence_radius_m: data.geofenceRadiusM as number,
    };

    const { data: before } = await supabase.from("companies").select("*").limit(1).maybeSingle();
    if (!before) return { ok: false, error: "Company profile not found — finish the setup wizard first" };

    const { error } = await supabase.from("companies").update(patch).eq("id", (before as CompanySettings).id);
    if (error) return { ok: false, error: friendly(error, "Could not save office settings") };

    await writeAudit(supabase, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "company.update",
      entity: "company",
      entityId: (before as CompanySettings).id,
      before: {
        name: (before as CompanySettings).name,
        office_start: (before as CompanySettings).office_start,
        grace_minutes: (before as CompanySettings).grace_minutes,
        half_day_hours: (before as CompanySettings).half_day_hours,
        weekend_days: (before as CompanySettings).weekend_days,
        office_lat: (before as CompanySettings).office_lat,
        office_lng: (before as CompanySettings).office_lng,
        geofence_radius_m: (before as CompanySettings).geofence_radius_m,
      },
      after: patch,
    });
    return { ok: true };
  });

// ---------- helpers ----------

async function actorEmail(context: AuthedContext): Promise<string | null> {
  const { data } = await context.supabase.auth.getUser();
  return data.user?.email ?? null;
}

function friendly(error: { message: string }, fallback: string): string {
  if (error.message?.includes("duplicate key")) return "An entry with this name already exists";
  return fallback;
}

