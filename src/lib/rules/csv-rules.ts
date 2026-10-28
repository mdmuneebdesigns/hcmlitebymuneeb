// Client-safe pure helpers for employee CSV import/export. No side effects —
// used by the server dry-run validator and unit tests.

export interface CsvEmployeeRow {
  employee_code?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  department?: string;
  designation?: string;
  join_date?: string;
  basic_salary?: string;
  gender?: string;
}

export interface RowError {
  row: number;
  field: string;
  reason: string;
}

export interface CsvValidateContext {
  existingCodes: Set<string>;
  existingEmails: Set<string>;
  knownDepartments: Set<string>;
  knownDesignations: Set<string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CSV_HEADERS = [
  "employee_code",
  "full_name",
  "email",
  "phone",
  "address",
  "department",
  "designation",
  "join_date",
  "basic_salary",
  "gender",
] as const;

/**
 * Validate one CSV row against the org context and against rows already seen
 * in the same file. Returns every problem with the exact row, field and
 * reason, per the brief's dry-run report requirement.
 */
export function validateCsvRow(
  row: CsvEmployeeRow,
  rowNumber: number,
  ctx: CsvValidateContext,
  seenCodes: Set<string>,
  seenEmails: Set<string>,
): RowError[] {
  const errors: RowError[] = [];

  const required: Array<[keyof CsvEmployeeRow, string]> = [
    ["employee_code", "Missing field: employee code is required"],
    ["full_name", "Missing field: full name is required"],
    ["email", "Missing field: email is required"],
    ["join_date", "Missing field: join date is required"],
    ["basic_salary", "Missing field: basic salary is required"],
  ];
  for (const [field, reason] of required) {
    const value = row[field];
    if (!value || !value.trim()) errors.push({ row: rowNumber, field, reason });
  }

  const email = (row.email ?? "").trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) {
    errors.push({ row: rowNumber, field: "email", reason: "Invalid email address" });
  } else if (email && (ctx.existingEmails.has(email) || seenEmails.has(email))) {
    errors.push({ row: rowNumber, field: "email", reason: "Duplicate email" });
  }

  const code = (row.employee_code ?? "").trim();
  if (code && (ctx.existingCodes.has(code) || seenCodes.has(code))) {
    errors.push({ row: rowNumber, field: "employee_code", reason: "Duplicate employee code" });
  }

  const department = (row.department ?? "").trim();
  if (department && !ctx.knownDepartments.has(department)) {
    errors.push({ row: rowNumber, field: "department", reason: "Unknown department" });
  }

  const designation = (row.designation ?? "").trim();
  if (designation && !ctx.knownDesignations.has(designation)) {
    errors.push({ row: rowNumber, field: "designation", reason: "Unknown designation" });
  }

  const joinDate = (row.join_date ?? "").trim();
  if (joinDate) {
    const valid =
      ISO_DATE_RE.test(joinDate) && !Number.isNaN(new Date(`${joinDate}T00:00:00Z`).getTime());
    if (!valid) {
      errors.push({ row: rowNumber, field: "join_date", reason: "Non-ISO date (use YYYY-MM-DD)" });
    }
  }

  const salaryRaw = (row.basic_salary ?? "").trim().replace(/,/g, "");
  if (salaryRaw) {
    const salary = Number(salaryRaw);
    if (!Number.isFinite(salary) || salary <= 0) {
      errors.push({ row: rowNumber, field: "basic_salary", reason: "Salary must be a number greater than 0" });
    }
  }

  seenCodes.add(code);
  seenEmails.add(email);
  return errors;
}

/** Parse a pasted/uploaded CSV (with quoted cells) into row objects. */
export function parseCsv(text: string): CsvEmployeeRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headerLine = lines[0] ?? "";
  const headers = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) row[h] = (cells[i] ?? "").trim();
    });
    return row as CsvEmployeeRow;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

/** Neutralize spreadsheet formula injection: a cell that starts with =, +, -, @, tab or CR
 *  is prefixed with a single quote so Excel/Sheets treat it as text, never a formula. */
export function sanitizeCsvCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Build a CSV string for export. */
export function toCsv(rows: Array<Record<string, string | number | null>>): string {
  const escape = (v: string | number | null) => {
    const s = sanitizeCsvCell(v === null || v === undefined ? "" : String(v));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((h) => escape(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}
