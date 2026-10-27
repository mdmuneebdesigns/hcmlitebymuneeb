import { describe, expect, it } from "vitest";
import { LEAD_INQUIRY_TYPES, validateLead } from "@/lib/leads";

const base = {
  fullName: "Ahmed Raza",
  email: "ahmed@company.com",
  phone: "+92 300 1234567",
  companyName: "Saylani Welfare Trust",
  teamSize: LEAD_INQUIRY_TYPES.length >= 1 ? "1–25 Employees" : "",
  inquiryType: LEAD_INQUIRY_TYPES[0],
  message: "We need attendance + payroll for 200 staff.",
};

describe("enterprise lead validation", () => {
  it("accepts a complete submission", () => {
    const result = validateLead(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("ahmed@company.com");
      expect(result.value.teamSize).toBe("1–25 Employees");
    }
  });

  it("rejects a too-short phone number", () => {
    const result = validateLead({ ...base, phone: "123" });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = validateLead({ ...base, email: "not-an-email" });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing message", () => {
    const result = validateLead({ ...base, message: "hi" });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing company name", () => {
    const result = validateLead({ ...base, companyName: "  " });
    expect(result.ok).toBe(false);
  });

  it("trims and collapses whitespace", () => {
    const result = validateLead({ ...base, fullName: "  Ahmed   Raza  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.fullName).toBe("Ahmed Raza");
  });
});
