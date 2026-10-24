import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface Me {
  userId: string;
  email: string;
  roles: string[];
  mustChangePassword: boolean;
  employeeId: string | null;
  fullName: string | null;
}

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Me> => {
    const { supabase, userId } = context;

    const [{ data: roleRows, error: roleError }, { data: empRow, error: empError }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("employees").select("id, full_name, must_change_password").eq("user_id", userId).maybeSingle(),
    ]);

    if (roleError) throw new Error("Could not load your roles");

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "";

    return {
      userId,
      email,
      roles: (roleRows ?? []).map((r) => r.role as string),
      mustChangePassword: empRow?.must_change_password ?? false,
      employeeId: empRow?.id ?? null,
      fullName: empRow?.full_name ?? null,
    };
  });

// Called right after the user changes their own password, so the
// "temporary password" flag set by HR/Admin is cleared.
export const clearMustChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("employees")
      .update({ must_change_password: false })
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not update your profile");
    return { ok: true };
  });
