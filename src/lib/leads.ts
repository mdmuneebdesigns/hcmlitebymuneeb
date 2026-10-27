/**
 * Enterprise lead capture — shared validation used by both the browser form
 * and the server function that stores the row.
 */

export const LEAD_INQUIRY_TYPES = [
  "Book a Live Product Demo",
  "Purchase SaaS Subscription",
  "Purchase Monthly Subscription ($49/month)",
  "Purchase Lifetime License ($499 one-time)",
  "Custom On-Premise / Cloud Deployment",
  "White-Label Source Code Acquisition",
  "License Key Activation",
  "AI / Computer Vision Integration Consultation",
] as const;

export const LEAD_TEAM_SIZES = [
  "1–25 Employees",
  "26–100 Employees",
  "101–500 Employees",
  "500+ Enterprise",
  "Custom White-Label / Source Code License",
] as const;

export const LEAD_PLANS = ["Interactive Demo Trial", "Monthly Cloud Subscription", "Lifetime Enterprise License"] as const;

export interface LeadInput {
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  teamSize: string;
  inquiryType: string;
  selectedPlan?: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LeadValidation =
  | { ok: true; value: Required<LeadInput> }
  | { ok: false; error: string };

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/** Validate a lead submission; every rule is mirrored in src/test/leads-rules.test.ts. */
export function validateLead(input: Partial<LeadInput>): LeadValidation {
  const fullName = clean(input.fullName);
  const email = clean(input.email).toLowerCase();
  const phone = clean(input.phone);
  const companyName = clean(input.companyName);
  const teamSize = clean(input.teamSize) || LEAD_TEAM_SIZES[0];
  const inquiryType = clean(input.inquiryType) || LEAD_INQUIRY_TYPES[0];
  const selectedPlan = clean(input.selectedPlan);
  const message = clean(input.message);

  if (fullName.length < 2 || fullName.length > 120) return { ok: false, error: "Full name is required (2–120 characters)" };
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, error: "A valid email address is required" };
  if (phone.replace(/\D/g, "").length < 7 || phone.length > 40) return { ok: false, error: "A valid phone / WhatsApp number is required" };
  if (companyName.length < 2 || companyName.length > 200) return { ok: false, error: "Company / organization name is required" };
  if (message.length < 5 || message.length > 2000) return { ok: false, error: "Please describe your requirement (5–2000 characters)" };
  if (selectedPlan.length > 80 || inquiryType.length > 120 || teamSize.length > 80) return { ok: false, error: "Selection is too long" };

  return { ok: true, value: { fullName, email, phone, companyName, teamSize, inquiryType, selectedPlan, message } };
}
