import { describe, expect, it } from "vitest";
import {
  parseCsv,
  toCsv,
  validateCsvRow,
  type CsvValidateContext,
} from "@/lib/rules/csv-rules";

const ctx: CsvValidateContext = {
  existingCodes: new Set(["EMP-001"]),
  existingEmails: new Set(["taken@corp.pk"]),
  knownDepartments: new Set(["Engineering", "HR"]),
  knownDesignations: new Set(["Engineer", "Manager"]),
};

function row(overrides: Partial<Record<string, string>> = {}) {
  return {
    employee_code: "EMP-100",
    full_name: "Ali Raza",
    email: "ali@corp.pk",
    join_date: "2026-01-15",
    basic_salary: "80000",
    ...overrides,
  };
}

describe("CSV dry-run validation", () => {
  it("accepts a clean row with no errors", () => {
    const errors = validateCsvRow(row(), 1, ctx, new Set(), new Set());
    expect(errors).toEqual([]);
  });

  it("reports each missing required field with row and reason", () => {
    const errors = validateCsvRow({ employee_code: "", full_name: "", email: "", join_date: "", basic_salary: "" }, 2, ctx, new Set(), new Set());
    const fields = errors.map((e) => e.field).sort();
    expect(fields).toEqual(["basic_salary", "email", "employee_code", "full_name", "join_date"]);
    expect(errors.every((e) => e.row === 2)).toBe(true);
  });

  it("flags a duplicate employee code from the database", () => {
    const errors = validateCsvRow(row({ employee_code: "EMP-001" }), 3, ctx, new Set(), new Set());
    expect(errors).toContainEqual({ row: 3, field: "employee_code", reason: "Duplicate employee code" });
  });

  it("flags a duplicate email already in the file", () => {
    const seenEmails = new Set<string>();
    validateCsvRow(row({ email: "dup@corp.pk" }), 4, ctx, new Set(), seenEmails);
    const errors = validateCsvRow(row({ employee_code: "EMP-200", email: "dup@corp.pk" }), 5, ctx, new Set(), seenEmails);
    expect(errors).toContainEqual({ row: 5, field: "email", reason: "Duplicate email" });
  });

  it("flags an invalid email", () => {
    const errors = validateCsvRow(row({ email: "not-an-email" }), 6, ctx, new Set(), new Set());
    expect(errors).toContainEqual(expect.objectContaining({ field: "email", reason: "Invalid email address" }));
  });

  it("flags an unknown department", () => {
    const errors = validateCsvRow(row({ department: "Finance" }), 7, ctx, new Set(), new Set());
    expect(errors).toContainEqual({ row: 7, field: "department", reason: "Unknown department" });
  });

  it("accepts a known department", () => {
    const errors = validateCsvRow(row({ department: "Engineering", designation: "Engineer" }), 8, ctx, new Set(), new Set());
    expect(errors).toEqual([]);
  });

  it("flags a non-ISO date", () => {
    const errors = validateCsvRow(row({ join_date: "15/01/2026" }), 9, ctx, new Set(), new Set());
    expect(errors).toContainEqual({ row: 9, field: "join_date", reason: "Non-ISO date (use YYYY-MM-DD)" });
  });

  it("flags zero or negative salary", () => {
    expect(validateCsvRow(row({ basic_salary: "0" }), 10, ctx, new Set(), new Set()))
      .toContainEqual(expect.objectContaining({ field: "basic_salary" }));
    expect(validateCsvRow(row({ basic_salary: "-500" }), 11, ctx, new Set(), new Set()))
      .toContainEqual(expect.objectContaining({ field: "basic_salary" }));
    expect(validateCsvRow(row({ basic_salary: "abc" }), 12, ctx, new Set(), new Set()))
      .toContainEqual(expect.objectContaining({ field: "basic_salary" }));
  });
});

describe("CSV parsing and export", () => {
  it("parses headers and rows, trimming whitespace and lowercasing headers", () => {
    const rows = parseCsv("Employee Code,Full Name,Email\n EMP-1 , Ali,ali@x.pk");
    expect(rows).toEqual([{ employee_code: "EMP-1", full_name: "Ali", email: "ali@x.pk" }]);
  });

  it("handles quoted cells with commas", () => {
    const rows = parseCsv('employee_code,full_name\nEMP-1,"Kamran, Jr."');
    expect(rows[0]?.full_name).toBe("Kamran, Jr.");
  });

  it("exports rows back to CSV with all headers", () => {
    const csv = toCsv([{ employee_code: "EMP-1", full_name: "Ali", basic_salary: "80000" }]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("employee_code");
    expect(lines[0]).toContain("basic_salary");
    expect(lines[1]).toContain("EMP-1");
  });
});
