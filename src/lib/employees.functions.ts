import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyRole, type AuthedContext } from "@/lib/rbac.server";
import { writeAudit } from "@/lib/audit.server";
import { validateCsvRow, type CsvEmployeeRow, type RowError } from "@/lib/rules/csv-rules";

// ---------- Types (client-safe) ----------

export interface DirectoryRow {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  status: string;
  department_name: string | null;
  designation_name: string | null;
  basic_salary: number;
  join_date: string;
  phone?: string | null;
  address?: string | null;
  gender?: string | null;
}


export interface DirectoryPage {
  rows: DirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Employee360 {
  employee: DirectoryRow & {
    user_id: string | null;
    phone: string | null;
    address: string | null;
    gender: string | null;
    exit_date: string | null;
    department_id: string | null;
    designation_id: string | null;
  };
  recentAttendance: Array<{
    id: string;
    work_date: string;
    check_in: string | null;
    check_out: string | null;
    status: string;
  }>;
  counts: { present: number; late: number; halfDay: number; missingCheckout: number };
  viewer: { canManage: boolean; canEditContact: boolean };
}

export interface CreateEmployeeInput {
  employeeCode: string;
  fullName: string;
  email: string;
  phone?: string;
  address?: string;
  departmentId?: string | null;
  designationId?: string | null;
  joinDate: string;
  basicSalary: number;
  gender?: string;
}

export type EmployeeWriteResult =
  | { ok: true; employeeId: string; tempPassword: string }
  | { ok: false; error: string };

type SimpleResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Temporary password (server-only) ----------

function pickFrom(chars: string, n: number): string {
  const bytes = new Uint32Array(n);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < n; i++) out += chars[bytes[i]! % chars.length];
  return out;
}

function generateTempPassword(): string {
  const raw =
    pickFrom("ABCDEFGHJKLMNPQRSTUVWXYZ", 3) +
    pickFrom("abcdefghijkmnpqrstuvwxyz", 4) +
    pickFrom("23456789", 3) +
    pickFrom("!@#$%&*?", 2);
  const arr = raw.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr.join("");
}

// ---------- Create employee (HR/Admin) ----------

function validateCreateEmployee(input: Partial<CreateEmployeeInput>): CreateEmployeeInput {
  const errors: string[] = [];
  if (!input.employeeCode || !input.employeeCode.trim()) errors.push("Employee code is required");
  if (!input.fullName || input.fullName.trim().length < 3) errors.push("Full name is required");
  if (!input.email || !EMAIL_RE.test(input.email.trim())) errors.push("A valid email is required");
  if (!input.joinDate || !ISO_DATE_RE.test(input.joinDate)) errors.push("Join date must be YYYY-MM-DD");
  if (typeof input.basicSalary !== "number" || !Number.isFinite(input.basicSalary) || input.basicSalary <= 0)
    errors.push("Basic salary must be greater than 0");
  if (errors.length > 0) throw new Error(errors[0] as string);
  return input as CreateEmployeeInput;
}

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<CreateEmployeeInput>) => validateCreateEmployee(input))
  .handler(async ({ context, data }): Promise<EmployeeWriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "hr", "admin");

    const email = data.email.trim().toLowerCase();
    const code = data.employeeCode.trim();

    // Uniqueness pre-checks against existing employees.
    const [{ data: dupCode }, { data: dupEmail }] = await Promise.all([
      supabase.from("employees").select("id").eq("employee_code", code).maybeSingle(),
      supabase.from("employees").select("id").eq("email", email).maybeSingle(),
    ]);
    if (dupCode) return { ok: false, error: `Employee code ${code} is already in use` };
    if (dupEmail) return { ok: false, error: `Email ${email} is already registered` };

    // Create the auth login: auto-confirmed, temporary password, forced change.
    const tempPassword = generateTempPassword();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName.trim() },
    });
    if (createError || !created.user) {
      const msg = createError?.message ?? "";
      if (msg.includes("already")) return { ok: false, error: `Email ${email} is already registered` };
      return { ok: false, error: "Could not create the employee login" };
    }

    const { data: employee, error: empError } = await supabaseAdmin
      .from("employees")
      .insert({
        user_id: created.user.id,
        employee_code: code,
        full_name: data.fullName.trim(),
        email,
        phone: data.phone?.trim() || null,
        address: data.address?.trim() || null,
        department_id: data.departmentId ?? null,
        designation_id: data.designationId ?? null,
        join_date: data.joinDate,
        basic_salary: data.basicSalary,
        gender: data.gender || null,
        must_change_password: true,
        status: "active",
      })
      .select("id")
      .single();
    if (empError || !employee) {
      // Roll the auth account back so a half-created employee cannot linger.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: "Could not save the employee record" };
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "employee" });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      await supabaseAdmin.from("employees").delete().eq("id", employee.id);
      return { ok: false, error: "Could not assign the employee role" };
    }

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "employee.create",
      entity: "employee",
      entityId: employee.id,
      after: {
        employee_code: code,
        full_name: data.fullName.trim(),
        email,
        join_date: data.joinDate,
        basic_salary: data.basicSalary,
      },
    });

    return { ok: true, employeeId: employee.id, tempPassword };
  });

// ---------- Create HR login (Admin only) ----------

export const createHrLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fullName: string; email: string }) => input)
  .handler(async ({ context, data }): Promise<EmployeeWriteResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "admin");

    const email = data.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "A valid email is required" };
    if (!data.fullName || data.fullName.trim().length < 3) return { ok: false, error: "Full name is required" };

    const tempPassword = generateTempPassword();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName.trim() },
    });
    if (createError || !created.user) {
      const msg = createError?.message ?? "";
      if (msg.includes("already")) return { ok: false, error: `Email ${email} is already registered` };
      return { ok: false, error: "Could not create the HR login" };
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "hr" });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: "Could not assign the HR role" };
    }

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "user.create_hr_login",
      entity: "auth_user",
      entityId: created.user.id,
      after: { email, role: "hr" },
    });

    return { ok: true, employeeId: created.user.id, tempPassword };
  });

// ---------- Directory (HR/Admin) ----------

export interface DirectoryQuery {
  search?: string;
  departmentId?: string | null;
  status?: string | null;
  page: number;
  pageSize: number;
}

export const listDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DirectoryQuery) => input)
  .handler(async ({ context, data }): Promise<DirectoryPage> => {
    await requireAnyRole(context, "hr", "admin");
    const { supabase } = context;

    const page = Math.max(0, Math.floor(data.page));
    const pageSize = Math.min(100, Math.max(5, Math.floor(data.pageSize)));

    let query = supabase
      .from("employees")
      .select(
        "id, employee_code, full_name, email, status, basic_salary, join_date, phone, address, gender, departments(name), designations(name)",
        { count: "exact" },
      );


    const search = (data.search ?? "").trim().replace(/[,%()]/g, "");
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,employee_code.ilike.%${search}%`);
    }
    if (data.departmentId) query = query.eq("department_id", data.departmentId);
    if (data.status) query = query.eq("status", data.status);

    const { data: rows, error, count } = await query
      .order("full_name")
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error) throw new Error("Could not load the employee directory");

    return {
      rows: (rows ?? []).map((r) => mapDirectoryRow(r as unknown as EmployeeRowBase)),
      total: count ?? 0,
      page,
      pageSize,
    };

  });

interface EmployeeRowBase {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  status: string;
  basic_salary: number;
  join_date: string;
  phone: string | null;
  address: string | null;
  gender: string | null;
  departments: { name: string } | null;
  designations: { name: string } | null;
}

function mapDirectoryRow(r: EmployeeRowBase): DirectoryRow {
  return {
    id: r.id,
    employee_code: r.employee_code,
    full_name: r.full_name,
    email: r.email,
    status: r.status,
    basic_salary: r.basic_salary,
    join_date: r.join_date,
    phone: r.phone,
    address: r.address,
    gender: r.gender,
    department_name: r.departments?.name ?? null,
    designation_name: r.designations?.name ?? null,
  };
}



// ---------- Employee 360 (own via RLS; HR/Admin anyone) ----------

export const getEmployee360 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { employeeId: string }) => input)
  .handler(async ({ context, data }): Promise<Employee360> => {
    const { supabase, userId } = context;
    const held = await requireAnyRole(context, "employee", "hr", "admin");
    const canManage = held.includes("hr") || held.includes("admin");

    const { data: emp, error } = await supabase
      .from("employees")
      .select(
        "id, user_id, employee_code, full_name, email, phone, address, gender, status, basic_salary, join_date, exit_date, department_id, designation_id, departments(name), designations(name)",
      )
      .eq("id", data.employeeId)
      .maybeSingle();

    if (error) throw new Error("Could not load the employee profile");
    if (!emp) throw new Error("Employee not found — you do not have access to this profile");

    const rec = emp as unknown as EmployeeRowBase & {
      user_id: string | null;
      exit_date: string | null;
      department_id: string | null;
      designation_id: string | null;
    };
    const base = mapDirectoryRow(rec);


    const { data: attendanceRows } = await supabase
      .from("attendance")
      .select("id, work_date, check_in, check_out, status")
      .eq("employee_id", data.employeeId)
      .order("work_date", { ascending: false })
      .limit(30);

    const list = attendanceRows ?? [];
    const counts = {
      present: list.filter((r) => r.status === "present").length,
      late: list.filter((r) => r.status === "late").length,
      halfDay: list.filter((r) => r.status === "half_day").length,
      missingCheckout: list.filter((r) => !r.check_out).length,
    };

    return {
      employee: {
        ...base,
        user_id: rec.user_id as string | null,
        phone: rec.phone as string | null,
        address: rec.address as string | null,
        gender: rec.gender as string | null,
        exit_date: rec.exit_date as string | null,
        department_id: rec.department_id as string | null,
        designation_id: rec.designation_id as string | null,
      },
      recentAttendance: list,
      counts,
      viewer: { canManage, canEditContact: rec.user_id === userId },
    };
  });

// ---------- Update employee (HR/Admin) ----------

export interface UpdateEmployeePatch {
  employeeId: string;
  fullName?: string;
  phone?: string | null;
  address?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  basicSalary?: number;
  status?: string;
  exitDate?: string | null;
  gender?: string | null;
  joinDate?: string;
}

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateEmployeePatch) => input)
  .handler(async ({ context, data }): Promise<SimpleResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "hr", "admin");

    const patch: Record<string, unknown> = {};
    if (data.fullName !== undefined && data.fullName.trim().length >= 3) patch.full_name = data.fullName.trim();
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.address !== undefined) patch.address = data.address;
    if (data.departmentId !== undefined) patch.department_id = data.departmentId;
    if (data.designationId !== undefined) patch.designation_id = data.designationId;
    if (data.basicSalary !== undefined) {
      if (!Number.isFinite(data.basicSalary) || data.basicSalary <= 0)
        return { ok: false, error: "Basic salary must be greater than 0" };
      patch.basic_salary = data.basicSalary;
    }
    if (data.status !== undefined) {
      if (!["active", "inactive", "exited"].includes(data.status))
        return { ok: false, error: "Status must be active, inactive or exited" };
      patch.status = data.status;
    }
    if (data.exitDate !== undefined) patch.exit_date = data.exitDate;
    if (data.gender !== undefined) patch.gender = data.gender;
    if (data.joinDate !== undefined) {
      if (!ISO_DATE_RE.test(data.joinDate)) return { ok: false, error: "Join date must be YYYY-MM-DD" };
      patch.join_date = data.joinDate;
    }
    if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("employees")
      .select("*")
      .eq("id", data.employeeId)
      .single();
    if (!before) return { ok: false, error: "Employee not found" };

    const { error } = await supabaseAdmin.from("employees").update(patch).eq("id", data.employeeId);
    if (error) return { ok: false, error: "Could not update the employee" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "employee.update",
      entity: "employee",
      entityId: data.employeeId,
      before: pickAuditFields(before),
      after: patch,
    });
    return { ok: true };
  });

function pickAuditFields(row: {
  full_name: string;
  phone: string | null;
  address: string | null;
  department_id: string | null;
  designation_id: string | null;
  basic_salary: number;
  status: string;
  exit_date: string | null;
  join_date: string;
}): Record<string, unknown> {
  return {
    full_name: row.full_name,
    phone: row.phone,
    address: row.address,
    department_id: row.department_id,
    designation_id: row.designation_id,
    basic_salary: row.basic_salary,
    status: row.status,
    exit_date: row.exit_date,
    join_date: row.join_date,
  };
}


// ---------- Employee edits own phone/address only ----------

export const updateMyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string | null; address: string | null }) => input)
  .handler(async ({ context, data }): Promise<SimpleResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "employee", "hr", "admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: own } = await supabaseAdmin
      .from("employees")
      .select("id, phone, address")
      .eq("user_id", userId)
      .maybeSingle();
    if (!own) return { ok: false, error: "No employee profile is linked to your account" };

    const patch = { phone: data.phone, address: data.address };
    const { error } = await supabaseAdmin
      .from("employees")
      .update(patch)
      .eq("id", own.id);
    if (error) return { ok: false, error: "Could not update your contact details" };

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      actorEmail: await actorEmail(context),
      action: "employee.update_own_contact",
      entity: "employee",
      entityId: own.id as string,
      before: { phone: own.phone ?? null, address: own.address ?? null },
      after: { phone: patch.phone, address: patch.address },
    });
    return { ok: true };
  });

// ---------- CSV dry-run + import (HR/Admin) ----------

export interface CsvRunRowReport {
  row: number;
  name: string;
  email: string;
  errors: RowError[];
}

export type CsvDryRunResult =
  | { ok: true; total: number; validCount: number; errorCount: number; rows: CsvRunRowReport[] }
  | { ok: false; error: string };

export const csvDryRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: CsvEmployeeRow[] }) => input)
  .handler(async ({ context, data }): Promise<CsvDryRunResult> => {
    await requireAnyRole(context, "hr", "admin");
    return await runDryRun(context, data.rows);
  });

async function runDryRun(context: AuthedContext, rows: CsvEmployeeRow[]): Promise<CsvDryRunResult> {
  const { supabase } = context;
  const [empRes, deptRes, desigRes] = await Promise.all([
    supabase.from("employees").select("employee_code, email"),
    supabase.from("departments").select("name"),
    supabase.from("designations").select("name"),
  ]);
  if (empRes.error || deptRes.error || desigRes.error) {
    return { ok: false, error: "Could not load validation data" };
  }

  const ctx = {
    existingCodes: new Set((empRes.data ?? []).map((e) => e.employee_code)),
    existingEmails: new Set((empRes.data ?? []).map((e) => e.email.toLowerCase())),
    knownDepartments: new Set((deptRes.data ?? []).map((d) => d.name)),
    knownDesignations: new Set((desigRes.data ?? []).map((d) => d.name)),
  };

  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();
  const reports: CsvRunRowReport[] = [];
  let validCount = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const errors = validateCsvRow(row, rowNumber, ctx, seenCodes, seenEmails);
    if (errors.length === 0) validCount++;
    reports.push({
      row: rowNumber,
      name: (row.full_name ?? "").trim(),
      email: (row.email ?? "").trim().toLowerCase(),
      errors,
    });
  });

  return { ok: true, total: rows.length, validCount, errorCount: rows.length - validCount, rows: reports };
}

export interface CsvImportResult {
  ok: boolean;
  error?: string;
  created?: number;
  skipped?: number;
  tempPasswords?: Array<{ fullName: string; email: string; tempPassword: string }>;
  rowErrors?: CsvRunRowReport[];
}

export const csvImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: CsvEmployeeRow[] }) => input)
  .handler(async ({ context, data }): Promise<CsvImportResult> => {
    const { supabase, userId } = context;
    await requireAnyRole(context, "hr", "admin");

    const dry = await runDryRun(context, data.rows);
    if (!dry.ok) return { ok: false, error: dry.error };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: deptRows } = await supabaseAdmin.from("departments").select("id, name");
    const { data: desigRows } = await supabaseAdmin.from("designations").select("id, name");
    const deptByName = new Map((deptRows ?? []).map((d) => [d.name, d.id]));
    const desigByName = new Map((desigRows ?? []).map((d) => [d.name, d.id]));

    const tempPasswords: Array<{ fullName: string; email: string; tempPassword: string }> = [];
    const createdIds: string[] = [];
    let created = 0;
    let skipped = 0;

    for (const report of dry.rows) {
      if (report.errors.length > 0) {
        skipped++;
        continue;
      }
      const row = data.rows[report.row - 2] as CsvEmployeeRow;
      const email = (row.email ?? "").trim().toLowerCase();
      const tempPassword = generateTempPassword();

      const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: (row.full_name ?? "").trim() },
      });
      if (createError || !createdUser.user) {
        skipped++;
        report.errors.push({ row: report.row, field: "email", reason: "Login could not be created (email may already exist)" });
        continue;
      }

      const { data: employee, error: empError } = await supabaseAdmin
        .from("employees")
        .insert({
          user_id: createdUser.user.id,
          employee_code: (row.employee_code ?? "").trim(),
          full_name: (row.full_name ?? "").trim(),
          email,
          phone: (row.phone ?? "").trim() || null,
          address: (row.address ?? "").trim() || null,
          department_id: deptByName.get((row.department ?? "").trim()) ?? null,
          designation_id: desigByName.get((row.designation ?? "").trim()) ?? null,
          join_date: (row.join_date ?? "").trim(),
          basic_salary: Number((row.basic_salary ?? "0").replace(/,/g, "")),
          gender: (row.gender ?? "").trim() || null,
          must_change_password: true,
          status: "active",
        })
        .select("id")
        .single();

      if (empError || !employee) {
        await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
        skipped++;
        report.errors.push({ row: report.row, field: "employee", reason: "Employee record could not be saved" });
        continue;
      }

      await supabaseAdmin.from("user_roles").insert({ user_id: createdUser.user.id, role: "employee" });
      created++;
      createdIds.push(employee.id);
      tempPasswords.push({ fullName: (row.full_name ?? "").trim(), email, tempPassword });
    }

    if (created > 0) {
      await writeAudit(supabaseAdmin, {
        actorId: userId,
        actorEmail: await actorEmail(context),
        action: "employee.csv_import",
        entity: "employee",
        entityId: null,
        after: { created, skipped, employee_ids: createdIds },
      });
    }

    return { ok: true, created, skipped, tempPasswords, rowErrors: dry.rows.filter((r) => r.errors.length > 0) };
  });

// ---------- helpers ----------

async function actorEmail(context: AuthedContext): Promise<string | null> {
  const { data } = await context.supabase.auth.getUser();
  return data.user?.email ?? null;
}
