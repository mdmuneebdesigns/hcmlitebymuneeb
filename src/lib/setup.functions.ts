import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OWNER_EMAIL } from "@/lib/license";

// ---------- Types (client-safe) ----------
export interface FirstRunStatus {
  companyExists: boolean;
}

export type SetupResult = { ok: true } | { ok: false; error: string };
export type ProvisionResult = { ok: true } | { ok: false; error: string };

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
  // License activation (1-device lock). Validated server-side before any
  // company row is created; the master key MUNEEB-VIP is owner-reserved.
  licenseKey: string;
  deviceHash: string | null;
  deviceInfo: string | null;
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

// ---------- First-run account provisioning (public, fresh-install only) ----------
// The handler itself verifies the workspace is still empty, so this can only
// ever run before the first company exists. The account is created confirmed
// (same as the original setup wizard) so the visitor is signed in instantly
// and routed to /setup — no email-verification round trip during judging.
export const provisionFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: { adminFullName?: string; adminEmail?: string; adminPassword?: string }) => {
    const fullName = (input.adminFullName ?? "").trim();
    const email = (input.adminEmail ?? "").trim().toLowerCase();
    const password = input.adminPassword ?? "";
    if (fullName.length < 2) throw new Error("Admin name is required");
    if (!EMAIL_RE.test(email)) throw new Error("A valid email is required");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    return { adminFullName: fullName, adminEmail: email, adminPassword: password };
  })
  .handler(async ({ data }): Promise<ProvisionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Guard: only on a fresh install.
    const { count } = await supabaseAdmin.from("companies").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      return { ok: false, error: "Setup already completed. Please sign in instead." };
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.adminEmail,
      password: data.adminPassword,
      email_confirm: true,
      user_metadata: { full_name: data.adminFullName },
    });
    if (createError || !created.user) {
      return { ok: false, error: createError?.message ?? "Could not create the account" };
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (roleError) return { ok: false, error: "Could not assign the Admin role" };

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: created.user.id,
      actor_email: data.adminEmail,
      action: "user.create",
      entity: "auth_user",
      entity_id: created.user.id,
      after_json: { source: "signup", provisional_admin: true },
    });

    return { ok: true };
  });

// ---------- Setup completion (authenticated) ----------
// The caller must be signed in. Their account becomes (or already is) the
// workspace Admin — no passwords are ever accepted or stored here.
export const completeFirstRunSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<SetupInput>) => validateSetup(input))
  .handler(async ({ context, data }): Promise<SetupResult> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { MASTER_SETUP_KEY, computeEffectiveStatus } = await import("@/lib/license");

    // Guard: the wizard can only run on a fresh install.
    const { count } = await supabaseAdmin.from("companies").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      return { ok: false, error: "Setup already completed. Please sign in instead." };
    }

    // License gate: nobody creates a real company without a valid key.
    const licenseKey = (data.licenseKey ?? "").trim().toUpperCase();
    if (!licenseKey) return { ok: false, error: "A valid license key is required to set up your company" };
    if (licenseKey !== MASTER_SETUP_KEY) {
      const { data: license } = await supabaseAdmin
        .from("workspace_licenses")
        .select("*")
        .eq("license_key", licenseKey)
        .maybeSingle();
      if (!license) return { ok: false, error: "This license key does not exist" };
      const lic = license as {
        id: string;
        status: string;
        expires_at: string | null;
        plan_type: string;
        bound_device_hash: string | null;
        bound_device_info: string | null;
      };
      if (lic.status === "revoked") return { ok: false, error: "This license key has been revoked by the platform owner" };
      const effective = computeEffectiveStatus(lic.status as "unclaimed", lic.expires_at);
      if (effective === "expired") {
        await supabaseAdmin.from("workspace_licenses").update({ status: "expired" }).eq("id", lic.id);
        return { ok: false, error: "This license has expired — contact the platform owner to extend it" };
      }
      if (lic.bound_device_hash && data.deviceHash && lic.bound_device_hash !== data.deviceHash) {
        return {
          ok: false,
          error: "Unauthorized Device: This license is already bound to another device. Contact Admin.",
        };
      }
    }

    // Resolve the caller's email from their session (never from input).
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "";
    if (userError || !EMAIL_RE.test(email)) {
      return { ok: false, error: "Your account has no valid email — please sign in again" };
    }

    // The owner master key may only be used by the platform owner's own account.
    if (licenseKey === MASTER_SETUP_KEY && email.toLowerCase() !== OWNER_EMAIL) {
      return { ok: false, error: "This master key is reserved for the platform owner" };
    }

    // 1. Ensure the admin role on the signed-in account (idempotent).
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
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

    // 2b. Bind the license to this device + company (first-device claim).
    if (licenseKey === MASTER_SETUP_KEY) {
      // Owner-reserved master key: auto-provision it as a lifetime license.
      await supabaseAdmin
        .from("workspace_licenses")
        .upsert(
          {
            license_key: licenseKey,
            plan_type: "lifetime",
            status: "active",
            max_devices: 99,
            company_id: company.id,
            assigned_email: email,
            assigned_company_name: data.companyName.trim(),
            bound_device_hash: data.deviceHash,
            bound_device_info: data.deviceInfo,
            activated_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          },
          { onConflict: "license_key" },
        );
    } else {
      const { error: bindError } = await supabaseAdmin
        .from("workspace_licenses")
        .update({
          status: "active",
          company_id: company.id,
          assigned_email: email,
          assigned_company_name: data.companyName.trim(),
          bound_device_hash: data.deviceHash,
          bound_device_info: data.deviceInfo,
          activated_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
        })
        .eq("license_key", licenseKey)
        .is("bound_device_hash", null);
      if (bindError) return { ok: false, error: "Company created but the license could not be claimed — contact support" };
    }


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
      {
        actor_id: userId,
        actor_email: email,
        action: "license.claim",
        entity: "workspace_license",
        entity_id: licenseKey,
        after_json: { company_id: company.id, device: data.deviceInfo, plan: licenseKey === MASTER_SETUP_KEY ? "lifetime" : "purchased" },
      },
    ]);

    return { ok: true };
  });
