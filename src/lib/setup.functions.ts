import { createServerFn } from "@tanstack/react-start";

// ---------- Types (client-safe) ----------
export interface FirstRunStatus {
  companyExists: boolean;
}

export type SetupResult = { ok: true } | { ok: false; error: string };

interface SetupInput {
  companyName: string;
  officeStart: string;
  graceMinutes: number;
  halfDayHours: number;
  weekendDays: string[];
  officeLat: number;
  officeLng: number;
  geofenceRadiusM: number;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function validateSetup(input: Partial<SetupInput>): SetupInput {
  const errors: string[] = [];
  if (!input.companyName || input.companyName.trim().length < 2) errors.push("Company name is required");
  if (!input.officeStart || !TIME_RE.test(input.officeStart)) errors.push("Office start must be HH:MM");
  if (typeof input.graceMinutes !== "number" || input.graceMinutes < 0 || input.graceMinutes > 120) errors.push("Grace time must be 0–120 minutes");
  if (typeof input.halfDayHours !== "number" || input.halfDayHours < 1 || input.halfDayHours > 8) errors.push("Half-day threshold must be 1–8 hours");
  if (!Array.isArray(input.weekendDays) || input.weekendDays.length === 0 || input.weekendDays.some((d) => !WEEKDAYS.includes(d)))
    errors.push("Select at least one weekend day");
  if (typeof input.officeLat !== "number" || input.officeLat < -90 || input.officeLat > 90) errors.push("Office latitude is invalid");
  if (typeof input.officeLng !== "number" || input.officeLng < -180 || input.officeLng > 180) errors.push("Office longitude is invalid");
  if (typeof input.geofenceRadiusM !== "number" || input.geofenceRadiusM < 10 || input.geofenceRadiusM > 10000) errors.push("Geofence radius must be 10–10000 m");
  if (!input.adminFullName || input.adminFullName.trim().length < 2) errors.push("Admin name is required");
  if (!input.adminEmail || !EMAIL_RE.test(input.adminEmail)) errors.push("Admin email is invalid");
  if (!input.adminPassword || input.adminPassword.length < 8) errors.push("Admin password must be at least 8 characters");
  if (errors.length > 0) throw new Error(errors[0]);
  return input as SetupInput;
}

// ---------- Public (unauthenticated) server functions ----------
// These power the first-run wizard. The handler itself verifies that the
// database is still empty, so the endpoint can only ever run once.

export const getFirstRunStatus = createServerFn({ method: "GET" }).handler(async (): Promise<FirstRunStatus> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin.from("companies").select("id", { count: "exact", head: true });
  if (error) throw new Error("Could not check setup status");
  return { companyExists: (count ?? 0) > 0 };
});

export const completeFirstRunSetup = createServerFn({ method: "POST" })
  .inputValidator((input: Partial<SetupInput>) => validateSetup(input))
  .handler(async ({ data }): Promise<SetupResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Guard: the wizard can only run on a fresh install.
    const { count } = await supabaseAdmin.from("companies").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      return { ok: false, error: "Setup already completed. Please sign in instead." };
    }

    // 1. Create the Admin auth account (confirmed immediately — HR-created logins only).
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.adminEmail,
      password: data.adminPassword,
      email_confirm: true,
      user_metadata: { full_name: data.adminFullName },
    });
    if (createError || !created.user) {
      return { ok: false, error: createError?.message ?? "Could not create the Admin account" };
    }

    // 2. Assign the admin role.
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "admin" });
    if (roleError) return { ok: false, error: "Could not assign the Admin role" };

    // 3. Create the company with its org rules and geofence.
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: data.companyName.trim(),
        office_start: data.officeStart,
        grace_minutes: data.graceMinutes,
        half_day_hours: data.halfDayHours,
        weekend_days: data.weekendDays,
        office_lat: data.officeLat,
        office_lng: data.officeLng,
        geofence_radius_m: data.geofenceRadiusM,
        setup_complete: true,
      })
      .select("id")
      .single();
    if (companyError || !company) return { ok: false, error: "Could not create the company profile" };

    // 4. Seed the standard leave types (org config, not demo data).
    const { error: ltError } = await supabaseAdmin.from("leave_types").insert([
      { name: "Annual", annual_quota: 14, is_paid: true },
      { name: "Sick", annual_quota: 8, is_paid: true },
      { name: "Casual", annual_quota: 10, is_paid: true },
      { name: "Unpaid", annual_quota: 0, is_paid: false },
    ]);
    if (ltError) return { ok: false, error: "Company created but leave types could not be seeded" };

    // 5. Audit log.
    await supabaseAdmin.from("audit_logs").insert([
      {
        actor_id: created.user.id,
        actor_email: data.adminEmail,
        action: "company.create",
        entity: "company",
        entity_id: company.id,
        after_json: { name: data.companyName, office_start: data.officeStart, geofence_radius_m: data.geofenceRadiusM },
      },
      { actor_id: created.user.id, actor_email: data.adminEmail, action: "user.create", entity: "auth_user", entity_id: created.user.id },
      { actor_id: created.user.id, actor_email: data.adminEmail, action: "role.assign", entity: "user_role", entity_id: created.user.id, after_json: { role: "admin" } },
    ]);

    return { ok: true };
  });
