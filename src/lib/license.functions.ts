// ============= License engine + Owner Super-Admin control (server) =============
// Device-bound license validation for /setup, the 1-device lock check for
// logins, and every privileged action behind /super-admin. All rows live in
// public.workspace_licenses which is admin-only (RLS deny-all), so everything
// here goes through supabaseAdmin after the caller is verified.

import { createServerFn, getRequestHeader } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MASTER_SETUP_KEY,
  OWNER_EMAIL,
  OWNER_PIN,
  PLAN_LABELS,
  computeEffectiveStatus,
  expiryForPlan,
  generateLicenseKey,
  planFromKey,
  type LicensePlan,
  type LicenseRow,
  type LicenseStatus,
} from "@/lib/license";
import { writeAudit } from "@/lib/audit.server";

// ---------- Types (client-safe) ----------

export interface LicenseCheckResult {
  ok: boolean;
  error?: string;
  plan?: LicensePlan;
  expiresAt?: string | null;
  master?: boolean;
}

export interface DeviceLockResult {
  locked: boolean;
  reason?: "device" | "expired" | "revoked";
  message?: string;
  plan?: LicensePlan;
  expiresAt?: string | null;
  boundDeviceInfo?: string;
  companyName?: string | null;
}

export interface LicenseKeyOut {
  key: string;
  plan: LicensePlan;
  expiresAt: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Owner guard ----------
// Two ways in: signed in with the owner email (bearer JWT), or the owner
// master PIN. Everything else is rejected server-side — the UI is not the
// security boundary.
async function assertSuperAdmin(pin?: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const auth = getRequestHeader("authorization");
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const jwt = auth.slice(7).trim();
    // Opaque sb_ keys are not JWTs — skip them, never feed them to auth.getUser.
    if (jwt && !jwt.startsWith("sb_")) {
      const { data } = await supabaseAdmin.auth.getUser(jwt);
      const email = data.user?.email?.toLowerCase() ?? null;
      if (email === OWNER_EMAIL) return email;
    }
  }
  if (pin === OWNER_PIN) return OWNER_EMAIL;
  throw new Error("Owner access required — sign in with the owner account or enter the Owner Master PIN");
}

// ---------- License validation (authenticated; used by /setup) ----------
// Read-only validation: unclaimed keys stay unclaimed here — the actual
// binding happens atomically inside completeFirstRunSetup.
export const validateLicenseKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { licenseKey?: string; deviceHash?: string }) => {
    return { licenseKey: (input.licenseKey ?? "").trim().toUpperCase(), deviceHash: input.deviceHash ?? null };
  })
  .handler(async ({ data }): Promise<LicenseCheckResult> => {
    if (!data.licenseKey) return { ok: false, error: "Enter your license key" };

    // Owner master key is always valid for the owner's own testing.
    if (data.licenseKey === MASTER_SETUP_KEY) {
      return { ok: true, plan: "lifetime", expiresAt: null, master: true };
    }
    if (!planFromKey(data.licenseKey)) {
      return { ok: false, error: "Invalid license key format (expected HCM-30D-XXXXXXXX or HCM-LIFE-XXXXXXXX)" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: license, error } = await supabaseAdmin
      .from("workspace_licenses")
      .select("*")
      .eq("license_key", data.licenseKey)
      .maybeSingle();
    if (error || !license) return { ok: false, error: "This license key does not exist" };

    const row = license as LicenseRow;
    if (row.status === "revoked") return { ok: false, error: "This license key has been revoked by the platform owner" };

    // Auto-expiry: an active key past its expiry is marked expired on sight.
    const effective = computeEffectiveStatus(row.status, row.expires_at);
    if (effective !== row.status) {
      await supabaseAdmin.from("workspace_licenses").update({ status: "expired" }).eq("id", row.id);
    }
    if (effective === "expired") {
      return { ok: false, error: "This license has expired — contact the platform owner to extend it" };
    }

    // 1-device lock: an already-claimed key only validates on its bound device.
    if (row.bound_device_hash && data.deviceHash && row.bound_device_hash !== data.deviceHash) {
      return {
        ok: false,
        error: `This license is already bound to another device (${row.bound_device_info ?? "unknown"}). Sharing licenses across devices is prohibited.`,
      };
    }

    return { ok: true, plan: row.plan_type, expiresAt: row.expires_at };
  });

// ---------- 1-device lock check (authenticated; called after sign-in) ----------
export const checkDeviceLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { deviceHash?: string; deviceInfo?: string }) => {
    return { deviceHash: input.deviceHash ?? null, deviceInfo: input.deviceInfo ?? null };
  })
  .handler(async ({ data }): Promise<DeviceLockResult> => {
    if (!data.deviceHash) return { locked: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: company } = await supabaseAdmin.from("companies").select("id, name").limit(1).maybeSingle();
    if (!company) return { locked: false };

    const { data: license } = await supabaseAdmin
      .from("workspace_licenses")
      .select("*")
      .eq("company_id", company.id)
      .maybeSingle();
    if (!license) return { locked: false };

    const row = license as LicenseRow;
    if (row.status === "revoked") {
      return {
        locked: true,
        reason: "revoked",
        message: "🔒 License Revoked: This workspace's license has been revoked by the platform owner. Contact Admin on WhatsApp (+92-3140263346) or US (+1-775-312-8079).",
        companyName: company.name,
      };
    }

    // Auto-expiry on sight.
    const effective = computeEffectiveStatus(row.status, row.expires_at);
    if (effective !== row.status) {
      await supabaseAdmin.from("workspace_licenses").update({ status: "expired" }).eq("id", row.id);
    }
    if (effective === "expired") {
      return {
        locked: true,
        reason: "expired",
        message: "🔒 License Expired: Your 30-day plan has ended. Renew on WhatsApp (+92-3140263346) or US (+1-775-312-8079).",
        plan: row.plan_type,
        expiresAt: row.expires_at,
        companyName: company.name,
      };
    }

    if (row.max_devices <= 1 && row.bound_device_hash && row.bound_device_hash !== data.deviceHash) {
      const info = row.bound_device_info ?? "another device";
      return {
        locked: true,
        reason: "device",
        boundDeviceInfo: info,
        message:
          `🔒 Single-Device License Lock: This license is already bound to another device (${info}). ` +
          "Sharing licenses across multiple devices is prohibited. " +
          "Contact Admin on WhatsApp (+92-3140263346) or US (+1-775-312-8079).",
        plan: row.plan_type,
        companyName: company.name,
      };
    }

    // Heartbeat: keep last_active_at fresh so the owner sees live devices.
    await supabaseAdmin
      .from("workspace_licenses")
      .update({ last_active_at: new Date().toISOString(), ...(row.bound_device_hash ? {} : { bound_device_info: data.deviceInfo }) })
      .eq("id", row.id);

    return { locked: false, plan: row.plan_type, expiresAt: row.expires_at, companyName: company.name };
  });

// ---------- Super-Admin: ping (PIN gate) ----------
export const superAdminPing = createServerFn({ method: "POST" })
  .inputValidator((input: { pin?: string }) => ({ pin: input.pin ?? "" }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    try {
      await assertSuperAdmin(data.pin);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Owner access required" };
    }
  });

// ---------- Super-Admin: licenses ----------
export const superAdminListLicenses = createServerFn({ method: "POST" })
  .inputValidator((input: { pin?: string }) => ({ pin: input.pin ?? "" }))
  .handler(async ({ data }): Promise<LicenseRow[]> => {
    await assertSuperAdmin(data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.from("workspace_licenses").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("Could not load licenses");
    return (rows ?? []) as unknown as LicenseRow[];
  });

export const superAdminGenerateLicense = createServerFn({ method: "POST" })
  .inputValidator((input: { pin?: string; plan?: LicensePlan; clientName?: string; clientEmail?: string; clientCompany?: string }) => {
    const plan = input.plan ?? "monthly_30d";
    if (plan !== "monthly_30d" && plan !== "lifetime" && plan !== "trial") throw new Error("Choose a valid plan");
    if (!input.clientName || input.clientName.trim().length < 2) throw new Error("Client name is required");
    if (!input.clientEmail || !EMAIL_RE.test(input.clientEmail.trim())) throw new Error("A valid client email is required");
    return {
      pin: input.pin ?? "",
      plan,
      clientName: input.clientName.trim(),
      clientEmail: input.clientEmail.trim().toLowerCase(),
      clientCompany: (input.clientCompany ?? "").trim(),
    };
  })
  .handler(async ({ data }): Promise<LicenseKeyOut> => {
    const actor = await assertSuperAdmin(data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Retry on the (very unlikely) unique-key collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = generateLicenseKey(data.plan);
      const expiresAt = expiryForPlan(data.plan);
      const { data: created, error } = await supabaseAdmin
        .from("workspace_licenses")
        .insert({
          license_key: key,
          plan_type: data.plan,
          status: "unclaimed",
          assigned_email: data.clientEmail,
          assigned_company_name: data.clientCompany || null,
          max_devices: 1,
          expires_at: data.plan === "lifetime" ? null : expiresAt,
        })
        .select("license_key, plan_type, expires_at")
        .single();
      if (error?.code === "23505") continue;
      if (error || !created) throw new Error("Could not generate the license key");

      await writeAudit(supabaseAdmin, {
        actorId: "00000000-0000-0000-0000-000000000000",
        actorEmail: actor,
        action: "license.generate",
        entity: "workspace_license",
        entityId: key,
        after: { plan: data.plan, client: data.clientEmail, expires_at: data.plan === "lifetime" ? null : expiresAt },
      });

      return {
        key: created.license_key,
        plan: created.plan_type as LicensePlan,
        expiresAt: created.expires_at,
      };
    }
    throw new Error("Could not generate a unique key — try again");
  });

export const superAdminLicenseAction = createServerFn({ method: "POST" })
  .inputValidator((input: { pin?: string; licenseId?: string; action?: "reset_device" | "extend" | "revoke" | "activate" }) => {
    if (!input.licenseId) throw new Error("License is required");
    if (!input.action || !["reset_device", "extend", "revoke", "activate"].includes(input.action)) {
      throw new Error("Unknown action");
    }
    return { pin: input.pin ?? "", licenseId: input.licenseId, action: input.action };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const actor = await assertSuperAdmin(data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: license } = await supabaseAdmin
      .from("workspace_licenses")
      .select("*")
      .eq("id", data.licenseId)
      .maybeSingle();
    if (!license) return { ok: false, error: "License not found" };
    const row = license as LicenseRow;
    const before: Record<string, unknown> = { status: row.status, expires_at: row.expires_at, bound_device_hash: row.bound_device_hash };

    if (data.action === "reset_device") {
      const { error } = await supabaseAdmin
        .from("workspace_licenses")
        .update({
          bound_device_hash: null,
          bound_device_info: null,
          activated_at: null,
          last_active_at: null,
          // The key comes back as a fresh claimable license.
          status: "unclaimed",
        })
        .eq("id", row.id);
      if (error) return { ok: false, error: "Could not reset the device lock" };
    } else if (data.action === "extend") {
      if (row.plan_type === "lifetime") return { ok: false, error: "Lifetime licenses never expire" };
      const base =
        row.expires_at && new Date(row.expires_at).getTime() > Date.now() ? new Date(row.expires_at) : new Date();
      const next = new Date(base.getTime() + 30 * 86_400_000);
      const { error } = await supabaseAdmin
        .from("workspace_licenses")
        .update({ expires_at: next.toISOString(), status: "active" })
        .eq("id", row.id);
      if (error) return { ok: false, error: "Could not extend the license" };
    } else if (data.action === "revoke") {
      const { error } = await supabaseAdmin
        .from("workspace_licenses")
        .update({ status: "revoked" })
        .eq("id", row.id);
      if (error) return { ok: false, error: "Could not revoke the license" };
    } else if (data.action === "activate") {
      const { error } = await supabaseAdmin
        .from("workspace_licenses")
        .update({ status: "active" })
        .eq("id", row.id);
      if (error) return { ok: false, error: "Could not reactivate the license" };
    }

    await writeAudit(supabaseAdmin, {
      actorId: "00000000-0000-0000-0000-000000000000",
      actorEmail: actor,
      action: `license.${data.action.replace("_", ".")}`,
      entity: "workspace_license",
      entityId: row.license_key,
      before,
      after: { action: data.action },
    });
    return { ok: true };
  });

// ---------- Super-Admin: companies monitor ----------
export interface SuperAdminCompany {
  id: string;
  name: string;
  officeStart: string | null;
  setupComplete: boolean;
  createdAt: string;
  adminEmail: string | null;
  adminLastSignIn: string | null;
  employeeCount: number;
  licenseKey: string | null;
  licenseStatus: LicenseStatus | null;
  licensePlan: LicensePlan | null;
  boundDeviceInfo: string | null;
  lastActiveAt: string | null;
}

export const superAdminListCompanies = createServerFn({ method: "POST" })
  .inputValidator((input: { pin?: string }) => ({ pin: input.pin ?? "" }))
  .handler(async ({ data }): Promise<SuperAdminCompany[]> => {
    await assertSuperAdmin(data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: companies }, { count: employeeCount }, { data: licenses }, { data: adminRoles }] = await Promise.all([
      supabaseAdmin.from("companies").select("id, name, office_start, setup_complete, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("employees").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("workspace_licenses").select("*"),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
    ]);

    // Map admin user ids → emails via the Auth admin API.
    const adminIds = new Set((adminRoles ?? []).map((r) => r.user_id as string));
    let adminEmail: string | null = null;
    let adminLastSignIn: string | null = null;
    if (adminIds.size > 0) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of users?.users ?? []) {
        if (adminIds.has(u.id) && u.email) {
          adminEmail = u.email;
          adminLastSignIn = u.last_sign_in_at ?? null;
          break;
        }
      }
    }

    return (companies ?? []).map((c) => {
      const lic = (licenses ?? []).find((l) => l.company_id === c.id) as LicenseRow | undefined;
      return {
        id: c.id,
        name: c.name,
        officeStart: c.office_start ?? null,
        setupComplete: c.setup_complete ?? false,
        createdAt: c.created_at,
        adminEmail,
        adminLastSignIn,
        employeeCount: employeeCount ?? 0,
        licenseKey: lic?.license_key ?? null,
        licenseStatus: (lic?.status as LicenseStatus) ?? null,
        licensePlan: (lic?.plan_type as LicensePlan) ?? null,
        boundDeviceInfo: lic?.bound_device_info ?? null,
        lastActiveAt: lic?.last_active_at ?? null,
      };
    });
  });

/**
 * Ban an unauthorized company: revoke its license, delete the whole workspace
 * (config, employees, attendance/leave/payroll history) and kick every signed
 *-in session. Licenses, leads and the audit trail are preserved.
 */
export const superAdminBanCompany = createServerFn({ method: "POST" })
  .inputValidator((input: { pin?: string; companyId?: string }) => {
    if (!input.companyId) throw new Error("Company is required");
    return { pin: input.pin ?? "", companyId: input.companyId };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const actor = await assertSuperAdmin(data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company } = await supabaseAdmin.from("companies").select("id, name").eq("id", data.companyId).maybeSingle();
    if (!company) return { ok: false, error: "Company not found" };

    // 1. Revoke every license linked to this company.
    const { error: licError } = await supabaseAdmin
      .from("workspace_licenses")
      .update({ status: "revoked" })
      .eq("company_id", data.companyId);
    if (licError) return { ok: false, error: "Could not revoke the company's license" };

    // 2. Delete the workspace — children first (same order as the judge reset).
    const tables = [
      "payslips",
      "payroll_runs",
      "attendance_corrections",
      "attendance",
      "leave_requests",
      "notifications",
      "announcements",
      "ai_logs",
      "employees",
      "public_holidays",
      "leave_types",
      "designations",
      "departments",
      "companies",
    ];
    for (const table of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabaseAdmin.from(table as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) return { ok: false, error: `Ban failed at ${table}: ${error.message}` };
    }

    // 3. Kick every session: delete the auth accounts so nobody stays signed in.
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!listError) {
      for (const user of users.users) {
        await supabaseAdmin.auth.admin.deleteUser(user.id);
      }
    }

    await writeAudit(supabaseAdmin, {
      actorId: "00000000-0000-0000-0000-000000000000",
      actorEmail: actor,
      action: "company.ban",
      entity: "company",
      entityId: data.companyId,
      before: { name: company.name },
      after: { banned: true, sessions_killed: true },
    });
    return { ok: true };
  });

// ---------- Super-Admin: sales leads inbox ----------
export interface SuperAdminLead {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  teamSize: string | null;
  inquiryType: string | null;
  selectedPlan: string | null;
  message: string;
  status: string;
  createdAt: string;
}

export const superAdminListLeads = createServerFn({ method: "POST" })
  .inputValidator((input: { pin?: string }) => ({ pin: input.pin ?? "" }))
  .handler(async ({ data }): Promise<SuperAdminLead[]> => {
    await assertSuperAdmin(data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.from("enterprise_leads").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("Could not load leads");
    return (rows ?? []).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      companyName: r.company_name,
      teamSize: r.team_size ?? null,
      inquiryType: r.inquiry_type ?? null,
      selectedPlan: r.selected_plan ?? null,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
    }));
  });

/** Approve a lead: generate a fresh license key for it and mark the lead approved. */
export const superAdminApproveLead = createServerFn({ method: "POST" })
  .inputValidator((input: { pin?: string; leadId?: string; plan?: LicensePlan }) => {
    if (!input.leadId) throw new Error("Lead is required");
    const plan = input.plan ?? "monthly_30d";
    if (!["monthly_30d", "lifetime", "trial"].includes(plan)) throw new Error("Choose a valid plan");
    return { pin: input.pin ?? "", leadId: input.leadId, plan };
  })
  .handler(async ({ data }): Promise<LicenseKeyOut & { ok: boolean; error?: string }> => {
    const actor = await assertSuperAdmin(data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lead } = await supabaseAdmin.from("enterprise_leads").select("*").eq("id", data.leadId).maybeSingle();
    if (!lead) return { ok: false, error: "Lead not found", key: "", plan: data.plan, expiresAt: null };

    const key = generateLicenseKey(data.plan);
    const expiresAt = expiryForPlan(data.plan);
    const { data: created, error } = await supabaseAdmin
      .from("workspace_licenses")
      .insert({
        license_key: key,
        plan_type: data.plan,
        status: "unclaimed",
        assigned_email: lead.email,
        assigned_company_name: lead.company_name,
        max_devices: 1,
        expires_at: data.plan === "lifetime" ? null : expiresAt,
      })
      .select("license_key, plan_type, expires_at")
      .single();
    if (error || !created) return { ok: false, error: "Could not generate the license key", key: "", plan: data.plan, expiresAt: null };

    await supabaseAdmin.from("enterprise_leads").update({ status: "approved" }).eq("id", data.leadId);

    await writeAudit(supabaseAdmin, {
      actorId: "00000000-0000-0000-0000-000000000000",
      actorEmail: actor,
      action: "lead.approve",
      entity: "workspace_license",
      entityId: key,
      after: { lead_id: data.leadId, plan: PLAN_LABELS[data.plan], client: lead.email },
    });

    return { ok: true, key: created.license_key, plan: created.plan_type as LicensePlan, expiresAt: created.expires_at };
  });

// ---------- Super-Admin: recent platform activity ----------
export interface SuperAdminAuditRow {
  id: string;
  action: string;
  entity: string;
  actorEmail: string | null;
  createdAt: string;
}

export const superAdminListAudit = createServerFn({ method: "POST" })
  .inputValidator((input: { pin?: string }) => ({ pin: input.pin ?? "" }))
  .handler(async ({ data }): Promise<SuperAdminAuditRow[]> => {
    await assertSuperAdmin(data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, entity, actor_email, created_at")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error("Could not load activity");
    return (rows ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      actorEmail: r.actor_email ?? null,
      createdAt: r.created_at,
    }));
  });
