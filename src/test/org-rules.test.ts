import { describe, expect, it } from "vitest";
import { normalizeOfficeStart } from "@/lib/org.functions";

// Rule: the office start time must always be stored/validated as strict "HH:MM",
// even when a Postgres time column hands back "HH:MM:SS" (broke office-location saves).
describe("normalizeOfficeStart", () => {
  it("normalizes Postgres time text HH:MM:SS to HH:MM", () => {
    expect(normalizeOfficeStart("09:00:00")).toBe("09:00");
  });

  it("pads single-digit hours", () => {
    expect(normalizeOfficeStart("9:30")).toBe("09:30");
  });

  it("keeps a valid HH:MM value unchanged", () => {
    expect(normalizeOfficeStart("09:00")).toBe("09:00");
  });

  it("passes garbage through unchanged so validation rejects it", () => {
    expect(normalizeOfficeStart("25:99")).toBe("25:99");
    expect(normalizeOfficeStart("")).toBe("");
    expect(normalizeOfficeStart(undefined)).toBe("");
  });
});
