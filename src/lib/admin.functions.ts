import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyRole } from "@/lib/rbac.server";

export type WipeResult = { ok: true } | { ok: false; error: string };

/**
 * Judge Reset / Wipe Database — Admin only.
 * Deletes every application row and auth user so the app returns to a
 * fresh-install state (first-run wizard will trigger again).
 */
export const wipeAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WipeResult> => {
    try {
      await requireAnyRole(context, "admin");
    } catch {
      return { ok: false, error: "Only the Admin can reset the database" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Children before parents.
    const tables = [
      "payslips",
      "payroll_runs",
      "attendance_corrections",
      "attendance",
      "leave_requests",
      "notifications",
      "announcements",
      "ai_logs",
      "audit_logs",
      "employees",
      "public_holidays",
      "leave_types",
      "designations",
      "departments",
      "user_roles",
      "companies",
    ];
    for (const table of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabaseAdmin.from(table as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) return { ok: false, error: `Reset failed at ${table}: ${error.message}` };
    }

    // Remove all auth accounts.
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return { ok: false, error: "Rows cleared but auth accounts could not be removed" };
    for (const user of users.users) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (error) return { ok: false, error: "Rows cleared but an auth account could not be removed" };
    }

    return { ok: true };
  });
