import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyRole } from "@/lib/rbac.server";
import { writeAudit } from "@/lib/audit.server";
import { actorEmail } from "@/lib/helpers.server";

// ---------- Announcements ----------

export interface AnnouncementDto {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author_name: string | null;
}

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnnouncementDto[]> => {
    const { data, error } = await context.supabase
      .from("announcements")
      .select("id, title, body, created_at, posted_by")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Could not load announcements");
    const rows = (data as unknown as { id: string; title: string; body: string; created_at: string; posted_by: string | null }[]) ?? [];
    const authorIds = [...new Set(rows.map((r) => r.posted_by).filter(Boolean))] as string[];
    const nameMap = new Map<string, string>();
    if (authorIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: emps } = await supabaseAdmin
        .from("employees")
        .select("user_id, full_name")
        .in("user_id", authorIds);
      for (const e of emps ?? []) {
        if (e.user_id) nameMap.set(e.user_id, e.full_name);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      created_at: r.created_at,
      author_name: r.posted_by ? (nameMap.get(r.posted_by) ?? null) : null,
    }));
  });

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title: string; body: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "hr", "admin");
    const title = data.title.trim();
    const body = data.body.trim();
    if (title.length < 3) return { ok: false, error: "Title is too short" };
    if (body.length < 5) return { ok: false, error: "Body is too short" };

    const { error } = await supabase.from("announcements").insert({ title, body, posted_by: userId });
    if (error) return { ok: false, error: "Could not post the announcement" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "announcement.create",
      entity: "announcement",
      after: { title },
    });

    // Notify everyone else
    const { data: roles } = await supabase.from("user_roles").select("user_id");
    const targets = [...new Set((roles ?? []).map((r) => r.user_id).filter((id) => id !== userId))];
    for (const uid of targets) {
      await supabaseAdmin.from("notifications").insert({ user_id: uid, title: "New announcement", body: title });
    }
    return { ok: true };
  });

// ---------- Notifications ----------

export interface NotificationDto {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationDto[]> => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, title, body, read, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error("Could not load notifications");
    return (data as NotificationDto[]) ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("notifications").update({ read: true }).eq("read", false);
    if (error) throw new Error("Could not mark notifications as read");
    return { ok: true };
  });

// ---------- Audit log viewer (Admin only) ----------

export interface AuditLogDto {
  id: string;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string }) => input)
  .handler(async ({ context, data }): Promise<AuditLogDto[]> => {
    await requireAnyRole(context, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("audit_logs")
      .select("id, actor_email, action, entity, entity_id, before_json, after_json, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.search && data.search.trim().length >= 2) {
      const term = `%${data.search.trim()}%`;
      q = q.or(`action.ilike.${term},entity.ilike.${term},actor_email.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error("Could not load audit logs");
    return (rows as unknown as AuditLogDto[]) ?? [];
  });
