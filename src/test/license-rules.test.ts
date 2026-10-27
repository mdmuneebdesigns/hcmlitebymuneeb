import { describe, expect, it } from "vitest";
import {
  MASTER_SETUP_KEY,
  OWNER_EMAIL,
  OWNER_PIN,
  computeEffectiveStatus,
  deviceLockMessage,
  expiryForPlan,
  formatDaysLeft,
  generateLicenseKey,
  isValidLicenseKeyFormat,
  planFromKey,
} from "@/lib/license";

describe("license key generation", () => {
  it("generates monthly keys in the HCM-30D-XXXXXXXX format", () => {
    const key = generateLicenseKey("monthly_30d");
    expect(key).toMatch(/^HCM-30D-[A-Z2-9]{8}$/);
    expect(key).not.toContain("0");
    expect(key).not.toContain("O");
    expect(key).not.toContain("1");
  });

  it("generates lifetime and trial keys with their own prefixes", () => {
    expect(generateLicenseKey("lifetime")).toMatch(/^HCM-LIFE-[A-Z2-9]{8}$/);
    expect(generateLicenseKey("trial")).toMatch(/^HCM-TRIAL-[A-Z2-9]{8}$/);
  });

  it("maps keys back to their plan", () => {
    expect(planFromKey("HCM-30D-ABCD2345")).toBe("monthly_30d");
    expect(planFromKey("hcm-life-xyz23456")).toBe("lifetime");
    expect(planFromKey("HCM-LIFE-ABCDEF23")).toBe("lifetime");
    expect(planFromKey("FREE-KEY")).toBeNull();
    expect(isValidLicenseKeyFormat("HCM-30D-ABCD2345")).toBe(true);
    expect(isValidLicenseKeyFormat("RANDOM")).toBe(false);
    // Owner master key is always format-valid.
    expect(isValidLicenseKeyFormat(MASTER_SETUP_KEY)).toBe(true);
  });
});

describe("license expiry engine", () => {
  it("monthly plans expire exactly 30 days after activation; lifetime never expires", () => {
    const activated = new Date("2026-10-27T00:00:00Z");
    expect(expiryForPlan("monthly_30d", activated)?.toISOString()).toBe("2026-11-26T00:00:00.000Z");
    expect(expiryForPlan("lifetime", activated)).toBeNull();
  });

  it("auto-marks an active license as expired once past its expiry", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(computeEffectiveStatus("active", "2026-10-26T23:59:59Z", now)).toBe("expired");
    expect(computeEffectiveStatus("active", "2026-10-27T00:00:01Z", now)).toBe("active");
    expect(computeEffectiveStatus("unclaimed", null, now)).toBe("unclaimed");
    // Revocation is sticky — expiry cannot un-revoke a key.
    expect(computeEffectiveStatus("revoked", null, now)).toBe("revoked");
  });

  it("formats the remaining-days countdown the owner sees", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(formatDaysLeft("2026-11-24T00:00:00Z", now)).toBe("28 days left");
    expect(formatDaysLeft("2026-10-28T00:00:00Z", now)).toBe("1 day left");
    expect(formatDaysLeft("2026-10-25T00:00:00Z", now)).toBe("Expired 2 days ago");
    expect(formatDaysLeft(null, now)).toBe("♾️ Lifetime");
  });
});

describe("1-device lock copy", () => {
  it("includes the bound device and both WhatsApp contacts", () => {
    const msg = deviceLockMessage("Chrome on Windows 10/11");
    expect(msg).toContain("Single-Device License Lock");
    expect(msg).toContain("Chrome on Windows 10/11");
    expect(msg).toContain("+92-3140263346");
    expect(msg).toContain("+1-775-312-8079");
  });
});

describe("owner access constants", () => {
  it("reserves the owner identity, PIN and master setup key", () => {
    expect(OWNER_EMAIL).toBe("mdmuneebdesigns@gmail.com");
    expect(OWNER_PIN).toBe("MUNEEB-ADMIN-2026");
    expect(MASTER_SETUP_KEY).toBe("MUNEEB-VIP");
  });
});
