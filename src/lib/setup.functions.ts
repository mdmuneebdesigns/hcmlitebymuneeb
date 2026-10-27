import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  if (errors.length > 0) throw new Error(errors[0]);
  return input as SetupInput;
}

// ---------- Public (unauthenticated) server function ----------
// Read-only status check used by the landing/auth surfaces to decide whether
// sign-up is still possible (fresh install) — reveals nothing else.
export const getFirstRunStatus = createServerFn({ method: "GET" }).handler(async (): Promise<FirstRunStatus> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin.from("companies").select("id", { count: "exact", head: true });
  if (error) throw new Error("Could not check setup status");
  return { companyExists: (count ?? 0) > 0 };
});

// ---------- Setup completion (authenticated) ----------
// The caller must be signed in (the /auth sign-up tab exists only on a fresh
// install). The signed-in account is promoted to Admin — no passwords are
// ever accepted or stored here.
export const completeFirstRunSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<SetupInput>) => validateSetup(input))
  .handler(async ({ context, data }): Promise<SetupResult> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Guard: the wizard can only run on a fresh install.
    const { count } = await supabaseAdmin.from("companies").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      return { ok: false, error: "Setup already completed. Please sign in instead." };
    }

    // Resolve the caller's email from their session (never from input).
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "";
    if (userError || !EMAIL_RE.test(email)) {
      return { ok: false, error: "Your account has no valid email — please sign in again" };
    }

    // 1. Assign the admin role to the signed-in account.
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (roleError) return { ok: false, error: "Could not assign the Admin role" };

    // 2. Create the company with its org rules and geofence.
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

    // 3. Seed the standard leave types (org config, not demo data).
    const { error: ltError } = await supabaseAdmin.from("leave_types").insert([
      { name: "Annual", annual_quota: 14, is_paid: true },
      { name: "Sick", annual_quota: 8, is_paid: true },
      { name: "Casual", annual_quota: 10, is_paid: true },
      { name: "Unpaid", annual_quota: 0, is_paid: false },
    ]);
    if (ltError) return { ok: false, error: "Company created but leave types could not be seeded" };

    // 4. Audit log.
    await supabaseAdmin.from("audit_logs").insert([
      {
        actor_id: userId,
        actor_email: email,
        action: "company.create",
        entity: "company",
        entity_id: company.id,
        after_json: { name: data.companyName, office_start: data.officeStart, geofence_radius_m: data.geofenceRadiusM },
      },
      { actor_id: userId, actor_email: email, action: "role.assign", entity: "user_role", entity_id: userId, after_json: { role: "admin" } },
    ]);

    return { ok: true };
  });
