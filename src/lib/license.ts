// ============= Pure license helpers (client-safe, unit-tested) =============

export const OWNER_EMAIL = "mdmuneebdesigns@gmail.com";
/** Owner master PIN for the /super-admin control panel. */
export const OWNER_PIN = "MUNEEB-ADMIN-2026";
/** Always-valid setup key reserved for the platform owner's own testing. */
export const MASTER_SETUP_KEY = "MUNEEB-VIP";

export const WHATSAPP_PK = "923140263346"; // +92-314-0263346
export const WHATSAPP_US = "17753128079"; // +1-775-312-8079

export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export type LicensePlan = "monthly_30d" | "lifetime" | "trial";
export type LicenseStatus = "unclaimed" | "active" | "expired" | "revoked";

export const PLAN_LABELS: Record<LicensePlan, string> = {
  monthly_30d: "30-Day Monthly (1-Device Lock)",
  lifetime: "Lifetime Enterprise (1-Device Lock)",
  trial: "Trial",
};

/** Unambiguous alphabet — no 0/O/1/I/L confusion when read over WhatsApp. */
const KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const PLAN_PREFIX: Record<LicensePlan, string> = {
  monthly_30d: "HCM-30D",
  lifetime: "HCM-LIFE",
  trial: "HCM-TRIAL",
};

/** Cryptographically secure default source — never Math.random in production. */
function secureRandomChar(): string {
  const buf = new Uint32Array(1);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(buf);
  } else {
    buf[0] = Math.floor(Math.random() * 4294967296);
  }
  return KEY_ALPHABET[buf[0]! % KEY_ALPHABET.length]!;
}

/** e.g. HCM-30D-K7QX9M2P (8 secure random chars; inject `random` only in tests). */
export function generateLicenseKey(plan: LicensePlan, random?: () => number): string {
  let suffix = "";
  if (random) {
    for (let i = 0; i < 8; i++) suffix += KEY_ALPHABET[Math.floor(random() * KEY_ALPHABET.length)]!;
  } else {
    for (let i = 0; i < 8; i++) suffix += secureRandomChar();
  }
  return `${PLAN_PREFIX[plan]}-${suffix}`;
}

export function planFromKey(key: string): LicensePlan | null {
  const normalized = key.trim().toUpperCase();
  if (normalized.startsWith("HCM-30D-")) return "monthly_30d";
  if (normalized.startsWith("HCM-LIFE-")) return "lifetime";
  if (normalized.startsWith("HCM-TRIAL-")) return "trial";
  return null;
}

export function isValidLicenseKeyFormat(key: string): boolean {
  return planFromKey(key) !== null || key.trim().toUpperCase() === MASTER_SETUP_KEY;
}

/** Days remaining on a license, rounded down; lifetime returns Infinity. */
export function daysLeft(expiresAt: string | null, now: Date = new Date()): number {
  if (!expiresAt) return Number.POSITIVE_INFINITY;
  const diff = new Date(expiresAt).getTime() - now.getTime();
  return Math.floor(diff / 86_400_000);
}

/** "28 days left" / "Expires today" / "Expired 3 days ago" / "♾️ Lifetime" */
export function formatDaysLeft(expiresAt: string | null, now: Date = new Date()): string {
  if (!expiresAt) return "♾️ Lifetime";
  const d = daysLeft(expiresAt, now);
  if (d > 1) return `${d} days left`;
  if (d === 1) return "1 day left";
  if (d === 0) return "Expires today";
  const behind = Math.abs(d);
  return behind === 1 ? "Expired 1 day ago" : `Expired ${behind} days ago`;
}

/** Auto-expiry rule: an active license past its expiry becomes "expired". */
export function computeEffectiveStatus(status: LicenseStatus, expiresAt: string | null, now: Date = new Date()): LicenseStatus {
  if (status !== "active" && status !== "unclaimed") return status;
  if (expiresAt && new Date(expiresAt).getTime() < now.getTime()) return "expired";
  return status;
}

export function expiryForPlan(plan: LicensePlan, activatedAt: Date = new Date()): Date | null {
  if (plan === "lifetime") return null;
  if (plan === "trial") return new Date(activatedAt.getTime() + 7 * 86_400_000);
  return new Date(activatedAt.getTime() + 30 * 86_400_000);
}

/** Lock-screen copy required by the owner spec. */
export function deviceLockMessage(boundDeviceInfo: string): string {
  return (
    `🔒 Single-Device License Lock: This license is already bound to another device (${boundDeviceInfo}). ` +
    "Sharing licenses across multiple devices is prohibited. " +
    `Contact Admin on WhatsApp (+92-3140263346) or US (+1-775-312-8079).`
  );
}

export interface LicenseRow {
  id: string;
  license_key: string;
  plan_type: LicensePlan;
  status: LicenseStatus;
  company_id: string | null;
  assigned_email: string | null;
  assigned_company_name: string | null;
  max_devices: number;
  bound_device_hash: string | null;
  bound_device_info: string | null;
  last_active_at: string | null;
  activated_at: string | null;
  expires_at: string | null;
  created_at: string;
}
