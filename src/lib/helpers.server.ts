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
