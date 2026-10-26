import { describe, expect, it } from "vitest";
import { isPasswordStrong } from "@/components/password-checklist";

// One test per password rule the user cares about.
describe("isPasswordStrong", () => {
  it("requires at least 8 characters", () => {
    expect(isPasswordStrong("Aa1!Aa1")).toBe(false); // 7 chars
    expect(isPasswordStrong("Aa1!Aa12")).toBe(true);
  });

  it("requires at least one uppercase letter", () => {
    expect(isPasswordStrong("aa1!aaaa")).toBe(false);
  });

  it("requires at least one lowercase letter", () => {
    expect(isPasswordStrong("AA1!AAAA")).toBe(false);
  });

  it("requires at least one number", () => {
    expect(isPasswordStrong("Aa!Aa!Aa")).toBe(false);
  });

  it("requires at least one special symbol", () => {
    expect(isPasswordStrong("Aa1Aa1Aa")).toBe(false);
  });

  it("accepts a password meeting all five rules", () => {
    expect(isPasswordStrong("Admin@HCM2026")).toBe(true);
  });
});
