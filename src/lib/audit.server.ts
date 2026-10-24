import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";


export interface AuditEntry {
  actorId: string;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Append one immutable audit record. Called from every create/update/approve
 * server function after the caller's role has been verified. Uses the
 * privileged client because audit_logs has no user INSERT policy (immutable).
 */
export async function writeAudit(
  client: SupabaseClient<Database>,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await client.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_email: entry.actorEmail,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    before_json: (entry.before ?? null) as Json,
    after_json: (entry.after ?? null) as Json,
  });

  if (error) console.error("[audit] insert failed:", error.message);
}
