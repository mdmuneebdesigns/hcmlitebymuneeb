import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = "admin" | "hr" | "employee";

export interface AuthedContext {
  supabase: SupabaseClient<Database>;
  userId: string;
}

/**
 * Server-side role guard for server functions. Every privileged server
 * function calls this before doing work — hiding buttons is not enough.
 */
export async function requireAnyRole(
  context: AuthedContext,
  ...allowed: AppRole[]
): Promise<string[]> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error("Could not verify your permissions");
  const held = (data ?? []).map((r) => r.role as string);
  if (!allowed.some((r) => held.includes(r))) {
    throw new Error("Forbidden: you do not have permission for this action");
  }
  return held;
}
