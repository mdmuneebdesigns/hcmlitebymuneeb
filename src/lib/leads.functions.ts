import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateLead, type LeadInput } from "@/lib/leads";

export type LeadSubmitResult = { stored: true; emailed: boolean } | { stored: false; error: string };

const FORMSUBMIT_ENDPOINT = "https://formsubmit.co/ajax/mdmuneebdesigns@gmail.com";
const OWNER_EMAIL = "mdmuneebdesigns@gmail.com";

/**
 * Public (unauthenticated) lead capture — called from the enterprise booking
 * form and the demo quota/license popups. The submission is stored in
 * public.enterprise_leads FIRST (anon INSERT-only policy), then forwarded to
 * the owner's FormSubmit inbox from the server, so iframe/CORS issues in the
 * preview can never block or lose a lead.
 */
export const submitEnterpriseLead = createServerFn({ method: "POST" })
  .inputValidator((input: LeadInput & { _honey?: string }) => {
    // Honeypot: bots fill it, humans never see it — pretend success silently.
    if (typeof input._honey === "string" && input._honey.trim().length > 0) {
      return {
        fullName: "Bot",
        email: "bot@example.invalid",
        phone: "+9200000000000",
        companyName: "Bot",
        teamSize: "1–25 Employees",
        inquiryType: "Bot",
        selectedPlan: "",
        message: "Bot submission",
        _bot: true,
      } as Required<LeadInput> & { _bot: boolean };
    }
    const result = validateLead(input);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  })
  .handler(async ({ data }): Promise<LeadSubmitResult> => {
    if ("_bot" in data) return { stored: true, emailed: false };

    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Lead storage is not configured");

    // Opaque sb_ keys aren't JWTs; send only apikey, not the default bearer.
    const supabase = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { error } = await supabase.from("enterprise_leads").insert({
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      company_name: data.companyName,
      team_size: data.teamSize,
      inquiry_type: data.inquiryType,
      selected_plan: data.selectedPlan || null,
      message: data.message,
    });
    if (error) {
      return { stored: false, error: "Your inquiry could not be logged. Please email " + OWNER_EMAIL + " directly." };
    }

    // Best-effort email delivery — storage already succeeded, so this failure
    // must never surface as a lost lead.
    let emailed = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(FORMSUBMIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: data.fullName,
          email: data.email,
          phone: data.phone,
          company: data.companyName,
          team_size: data.teamSize,
          inquiry_type: data.inquiryType,
          selected_plan: data.selectedPlan || "—",
          message: data.message,
          _subject: "🚀 New HCM Lite Enterprise Demo / License Inquiry!",
          _template: "table",
          _captcha: "false",
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      emailed = res.ok;
    } catch {
      emailed = false;
    }

    return { stored: true, emailed };
  });
