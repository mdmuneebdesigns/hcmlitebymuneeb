import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface AuthedLike {
  supabase: SupabaseClient<Database>;
  userId: string;
}

export async function getOwnEmployeeId(context: AuthedLike): Promise<string | null> {
  const { data } = await context.supabase
    .from("employees")
    .select("id")
    .eq("user_id", context.userId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function actorEmail(context: AuthedLike): Promise<string | null> {
  const { data } = await context.supabase.auth.getUser();
  return data.user?.email ?? null;
}

export interface CompanyRules {
  office_start: string;
  grace_minutes: number;
  half_day_hours: number;
  weekend_days: string[];
  office_lat: number;
  office_lng: number;
  geofence_radius_m: number;
  late_penalty_lates: number;
  late_penalty_days: number;
}

export async function getCompanyRules(context: AuthedLike): Promise<CompanyRules | null> {
  const { data } = await context.supabase
    .from("companies")
    .select(
      "office_start, grace_minutes, half_day_hours, weekend_days, office_lat, office_lng, geofence_radius_m, late_penalty_lates, late_penalty_days",
    )
    .limit(1)
    .maybeSingle();
  return (data as CompanyRules | null) ?? null;
}

/** Notify a user (privileged — notifications have no user INSERT policy). */
export async function notify(
  admin: SupabaseClient<Database>,
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  const { error } = await admin.from("notifications").insert({ user_id: userId, title, body });
  if (error) console.error("[notify] insert failed:", error.message);
}

/** All user ids holding the given roles (via the security-definer helper). */
export async function userIdsWithRole(
  context: AuthedLike,
  roles: string[],
): Promise<string[]> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  void data;
  void error;
  // user_roles readable by authenticated; filter in JS to avoid recursive RLS.
  const { data: rows } = await context.supabase
    .from("user_roles")
    .select("user_id, role");
  return (rows ?? []).filter((r) => roles.includes(r.role as string)).map((r) => r.user_id);
}

/**
 * Never block attendance/leave on a missing profile: Admin/HR accounts created
 * during first-run setup have no employees row. Auto-create and link one on
 * the fly (privileged write via the service-role client).
 */
export async function ensureOwnEmployeeProfile(context: AuthedLike): Promise<string | null> {
  const existing = await getOwnEmployeeId(context);
  if (existing) return existing;

  const email = await actorEmail(context);
  if (!email) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: auth } = await context.supabase.auth.getUser();
  const fullName =
    ((auth?.user as { user_metadata?: { full_name?: string } } | undefined)?.user_metadata?.full_name ?? "").trim() ||
    email.split("@")[0];
  const joinDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  for (let attempt = 0; attempt < 3; attempt++) {
    const employeeCode = `EMP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data, error } = await supabaseAdmin
      .from("employees")
      .insert({
        user_id: context.userId,
        employee_code: employeeCode,
        full_name: fullName,
        email,
        join_date: joinDate,
        status: "active",
        // Placeholder salary so the auto-linked profile never distorts payroll.
        basic_salary: 1,
        must_change_password: false,
      })
      .select("id")
      .single();
    if (!error && data) return data.id as string;

    const message = error?.message ?? "";
    if (message.includes("employees_email_key")) {
      // An unlinked employee row already uses this email — adopt it.
      const { data: byEmail } = await supabaseAdmin
        .from("employees")
        .select("id, user_id")
        .eq("email", email)
        .maybeSingle();
      if (byEmail) {
        if (!byEmail.user_id) {
          await supabaseAdmin
            .from("employees")
            .update({ user_id: context.userId })
            .eq("id", byEmail.id as string);
        }
        return byEmail.id as string;
      }
      return null;
    }
    // Anything else (e.g. a duplicate employee_code) — regenerate and retry.
  }
  return null;
}
