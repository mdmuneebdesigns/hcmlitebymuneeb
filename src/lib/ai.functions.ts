import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import type { AuthedContext } from "@/lib/rbac.server";
import { requireAnyRole } from "@/lib/rbac.server";
import { AI_TOOLS } from "@/lib/ai.tools.server";
import { getOwnEmployeeId } from "@/lib/helpers.server";
import { callGemini } from "@/lib/gemini.server";

const MODEL = "openai/gpt-6-astra" as const;
const TIMEOUT_MS = 15_000;
const MAX_TOOL_ROUNDS = 4;

// ---------- ai_logs ----------

async function logAi(
  context: AuthedContext,
  feature: string,
  question: string,
  answer: string,
  success: boolean,
  latencyMs: number,
  toolCalls: unknown,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_logs").insert({
      user_id: context.userId,
      feature,
      question: question.slice(0, 2000),
      answer: answer.slice(0, 4000),
      success,
      latency_ms: Math.round(latencyMs),
      tool_calls: (toolCalls ?? null) as never,
    });
  } catch (e) {
    console.error("[ai_logs] insert failed:", e);
  }
}

// Best-effort per-user rate limit (stateless worker — a guardrail, not a quota).
const rateMap = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const hits = (rateMap.get(userId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= 30) return true;
  hits.push(now);
  rateMap.set(userId, hits);
  return false;
}

// ---------- Prompt-injection / impersonation guard ----------
// User-supplied text is neutralized before it reaches any model: role-override
// and fake-system-message attempts become inert "[blocked]" markers.
const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier|earlier\s+instructions|any\s+previous)\s+(?:instructions?|prompts?|rules?|messages?)/gi, "[blocked]"],
  [/\b(?:system|developer|assistant)\s*(?:prompt|message)\s*:/gi, "[blocked]"],
  [/\byou\s+are\s+now\s+(?:a|an|the)\b/gi, "[blocked]"],
  [/\bnew\s+(?:instructions?|rules?|system\s+prompt)\s*:/gi, "[blocked]"],
  [/\bact\s+as\s+(?:if\s+you\s+are\s+)?(?:the\s+)?(?:admin|hr|owner|system)\b/gi, "[blocked]"],
];

export function sanitizeUserText(text: string): string {
  let out = text;
  for (const [re, sub] of INJECTION_PATTERNS) out = out.replace(re, sub);
  return out;
}

function toolSchemas() {
  return AI_TOOLS.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
}

function roleSummary(roles: string[]): string {
  const r: string[] = [];
  if (roles.includes("admin")) r.push("Admin (full organization access)");
  if (roles.includes("hr")) r.push("HR (organization-wide people data, salaries visible)");
  if (roles.includes("employee")) r.push("Employee (own records only; never other employees' salaries)");
  return r.join(", ");
}

const POLICY_TEXT = `
Office policy summary (ground truth for answers):
- Office hours start per company settings; arrival after start + grace minutes is marked LATE.
- Working below the half-day threshold hours in a day is a HALF DAY.
- Weekend days and public holidays are non-working; leave counts only working days.
- Leave types and yearly quotas come from the company's leave types table (e.g. Annual, Sick, Casual; Unpaid is typically unlimited).
- Overlapping leave requests are not allowed; exceeding a type's yearly quota is not allowed.
- Payroll: Gross = 1.5 × basic (HRA 40% + medical 10% of basic). Per-day rate = gross ÷ working days in month.
- Deductions: absent days, unpaid leave days, 0.5 × half days, and a configurable late penalty (default: every 3 lates cost 0.5 day).
- Income tax is progressive on annualized gross (gross × 12): 0% up to 600k; 5% up to 1.2M; 30k + 15% up to 2.4M; 210k + 25% up to 3.6M; 510k + 35% above.
- Attendance corrections require HR/Admin approval.
- Payroll runs are drafted by HR/Admin and finalized/locked by Admin only.
`.trim();

async function callModel(input: unknown[], instructions: string, useTools: boolean) {
  return generateResponse(
    {
      model: MODEL,
      input: input as never,
      instructions,
      ...(useTools ? { tools: toolSchemas() as never } : {}),
    },
    { signal: AbortSignal.timeout(TIMEOUT_MS), maxRetries: 1 },
  );
}

function extractText(response: Awaited<ReturnType<typeof callModel>>): string {
  for (const item of response.output) {
    if (item.type === "message" && Array.isArray(item.content)) {
      const text = item.content
        .filter((c) => c.type === "output_text")
        .map((c) => c.text ?? "")
        .join("");
      if (text) return text;
    }
  }
  return "";
}

// ---------- Chat ----------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const aiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: ChatMessage[] }) => input)
  .handler(async ({ context, data }): Promise<{ reply: string; aiGenerated: true }> => {
    await requireAnyRole(context, "employee", "hr", "admin");
    if (rateLimited(context.userId)) {
      return {
        reply: "You are sending messages too quickly — please wait a minute and try again.",
        aiGenerated: true,
      };
    }
    const held = await requireAnyRole(context, "employee", "hr", "admin");
    const roles = held;
    const ownEmployeeId = await getOwnEmployeeId(context);
    const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);

    const instructions = [
      "You are the HCM Lite assistant for this company's HR system.",
      `The caller is: ${roleSummary(roles)}. Employee profile linked: ${ownEmployeeId ? "yes" : "no"}.`,
      `Today's date (Pakistan): ${today}.`,
      POLICY_TEXT,
      "Rules: Use the provided tools whenever the answer needs data; never invent numbers.",
      "If the user asks for data they are not authorized to see (e.g. an employee asking for a colleague's salary or someone else's attendance), politely refuse in one short sentence and suggest what they can do instead.",
      "Keep answers short and friendly. Reply in the user's language (English or Roman Urdu).",
      "All answers are AI-generated suggestions, not official decisions.",
    ].join("\n");

    const input: unknown[] = data.messages
      .slice(-12)
      .map((m) => ({ role: m.role, content: [{ type: "input_text", text: sanitizeUserText(m.content) }] }));

    const started = Date.now();
    const toolCallsMade: { name: string; args: unknown }[] = [];
    let reply = "";
    let success = true;

    try {
      let conversation = [...input];
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
        const response = await callModel(conversation, instructions, true);
        const calls = response.output.filter(
          (i): i is { type: "function_call"; call_id: string; name: string; arguments: string } => i.type === "function_call",
        );
        if (calls.length === 0) {
          reply = extractText(response) || "I could not produce an answer — please rephrase your question.";
          break;
        }
        for (const call of calls) {
          let args: Record<string, unknown> = {};
          try {
            args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
          } catch {
            args = {};
          }
          const tool = AI_TOOLS.find((t) => t.name === call.name);
          let output: unknown;
          if (!tool) output = { error: `Unknown tool ${call.name}` };
          else {
            try {
              output = await tool.run(args, context, roles);
            } catch (e) {
              output = { error: e instanceof Error ? e.message : "Tool failed" };
            }
          }
          toolCallsMade.push({ name: call.name, args });
          conversation.push(call as never);
          conversation.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(output).slice(0, 8000),
          } as never);
        }
        if (round === MAX_TOOL_ROUNDS) {
          const response2 = await callModel(conversation, instructions, false);
          reply = extractText(response2) || "I could not complete that request.";
        }
      }
    } catch (e) {
      success = false;
      if (e instanceof GatewayError) {
        reply =
          e.code === "rate_limited"
            ? "The AI service is busy right now — please try again in a moment."
            : "The AI service is unavailable right now. Please try again shortly.";
      } else if (e instanceof GatewayError && e.code === "timeout") {
        reply = "The AI took too long to answer (15s limit). Please try a shorter question.";
      } else {
        reply = "Something went wrong talking to the AI service. Please try again.";
      }
      console.error("[aiChat]", e);
    }

    await logAi(context, "chat", data.messages.at(-1)?.content ?? "", reply, success, Date.now() - started, toolCallsMade);
    return { reply, aiGenerated: true };
  });

// ---------- KPI summarizer (HR/Admin) ----------

export const summarizeKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kpis: unknown }) => input)
  .handler(async ({ context, data }): Promise<{ bullets: string[]; aiGenerated: true }> => {
    await requireAnyRole(context, "hr", "admin");
    const started = Date.now();
    let bullets: string[] = [];
    let success = true;
    try {
      const response = await callModel(
        [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Summarize these HR dashboard KPIs as exactly 3 to 5 short bullet lines (start each with "- "). Use only the numbers in the JSON, no invented data.\nKPI JSON:\n${JSON.stringify(data.kpis).slice(0, 6000)}`,
              },
            ],
          },
        ],
        "You are an HR analytics summarizer. Output only the bullet lines, nothing else.",
        false,
      );
      const text = extractText(response);
      bullets = text
        .split("\n")
        .map((l) => l.replace(/^[-•*]\s*/, "").trim())
        .filter((l) => l.length > 0)
        .slice(0, 5);
      if (bullets.length === 0) bullets = ["No insights could be generated from the current data."];
    } catch (e) {
      success = false;
      bullets =
        e instanceof GatewayError && e.code === "rate_limited"
          ? ["AI service is busy — try again in a moment."]
          : ["AI summarizer is unavailable right now."];
      console.error("[summarizeKpis]", e);
    }
    await logAi(context, "kpi_summary", JSON.stringify(data.kpis).slice(0, 1500), bullets.join(" | "), success, Date.now() - started, null);
    return { bullets, aiGenerated: true };
  });

// ---------- Smart leave parser (English + Roman Urdu) ----------

export interface ParsedLeave {
  leaveType: string | null;
  startDate: string | null;
  endDate: string | null;
  reason: string | null;
  note: string | null;
}

export const parseLeaveText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string }) => input)
  .handler(async ({ context, data }): Promise<{ parsed: ParsedLeave | null; aiGenerated: true }> => {
    await requireAnyRole(context, "employee", "hr", "admin");
    const started = Date.now();
    const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
    let parsed: ParsedLeave | null = null;
    let success = true;
    try {
      const response = await generateResponse(
        {
          model: MODEL,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Parse this leave request (English or Roman Urdu) and return ONLY a JSON object with keys leaveType (one of: Annual, Sick, Casual, Unpaid, or null), startDate (YYYY-MM-DD or null), endDate (YYYY-MM-DD or null), reason (short string or null), note (one short clarification or null). "Agle Monday" means the coming Monday; a single day uses the same date for start and end. Today is ${today}. Leave text: """${data.text.slice(0, 500)}"""`,
                },
              ],
            },
          ],
          instructions: "Return only valid JSON, no markdown, no commentary.",
          text: { format: { type: "json_object" } },
        },
        { signal: AbortSignal.timeout(TIMEOUT_MS), maxRetries: 1 },
      );
      const text = extractText(response);
      const json = JSON.parse(text) as ParsedLeave;
      parsed = {
        leaveType: json.leaveType ?? null,
        startDate: json.startDate ?? null,
        endDate: json.endDate ?? null,
        reason: json.reason ?? null,
        note: json.note ?? null,
      };
    } catch (e) {
      success = false;
      console.error("[parseLeaveText]", e);
    }
    await logAi(context, "leave_parse", data.text.slice(0, 500), JSON.stringify(parsed), success, Date.now() - started, null);
    return { parsed, aiGenerated: true };
  });

// ---------- Policy Q&A ----------

export const policyAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { question: string }) => input)
  .handler(async ({ context, data }): Promise<{ answer: string; aiGenerated: true }> => {
    await requireAnyRole(context, "employee", "hr", "admin");
    if (rateLimited(context.userId)) {
      return { answer: "You are sending questions too quickly — please wait a minute.", aiGenerated: true };
    }
    const started = Date.now();
    let answer = "";
    let success = true;
    try {
      const response = await callModel(
        [
          {
            role: "user",
            content: [
              { type: "input_text", text: `Answer this company policy question using ONLY the policy summary below. If it is not covered, say so politely. Keep it under 120 words. Reply in English or Roman Urdu to match the question.\n\nPolicy summary:\n${POLICY_TEXT}\n\nQuestion: ${data.question.slice(0, 500)}` },
            ],
          },
        ],
        "You are a grounded company-policy Q&A assistant. Never invent policy details.",
        false,
      );
      answer = extractText(response) || "I could not answer that right now.";
    } catch (e) {
      success = false;
      answer = e instanceof GatewayError && e.code === "rate_limited"
        ? "The AI service is busy — please try again in a moment."
        : "The AI service is unavailable right now. Please try again shortly.";
      console.error("[policyAnswer]", e);
    }
    await logAi(context, "policy_qa", data.question.slice(0, 500), answer, success, Date.now() - started, null);
    return { answer, aiGenerated: true };
  });

// ---------- Public website assistant (landing page visitors, no login) ----------

const SITE_KNOWLEDGE = `
HCM Lite product knowledge (ground truth for website answers — never invent anything outside this):
- HCM Lite is a lightweight cloud HRMS built by Muhammad Muneeb (MD. Muneeb). 9 modules / 25 features.
- Modules: First-run Setup wizard, Org Setup (departments/designations/office location), Employee Directory
  (+ Employee 360 profiles, CSV import/export), Attendance (GPS geofence check-in/out + camera face check,
  late/half-day rules), Leave Management (types, quotas, employee requests + HR/Admin approval, Smart AI
  pre-fill), Payroll Lite (auto salary from attendance/leave, deductions, PDF payslip download),
  Announcements & Notifications, Audit Logs, AI Assistant (role-scoped, answers from real company data).
- Key rules: late = arrival after office start + grace; worked hours below threshold = half day;
  payroll Gross = 1.5 x basic; progressive income tax; attendance timezone is Pakistan Standard Time.
- Security: server-side role authorization (Admin/HR/Employee), audit trail of every write,
  all data protected by row-level security in the cloud database.
- Licensing: 1 license key = 1 device (device fingerprint lock). Plans: Monthly $49/month (was $100),
  Lifetime $499 one-time (was $999), Free Interactive Demo Trial (5 actions per module, no signup).
- Demo: "Explore Live Interactive Demo" button on the landing page / login screen — no signup needed.
- Setup: "Setup Your Company" button → signup → license key → company wizard. Client license keys are
  sent by the owner via WhatsApp.
- Owner contacts: WhatsApp / PK Desk +92-314-0263346 (WhatsApp + calls), US Desk +1 (775) 312-8079
  (WhatsApp only), email mdmuneebdesigns@gmail.com. Booking form: "Enterprise Demo" section on this page.
- AI: the in-app assistant and this website assistant are powered by Google Gemini (latest low-cost model,
  with the Lovable AI Gateway as automatic fallback); in-app answers are role-scoped and logged, and carry
  an "AI-generated" badge.
`.trim();

export const siteChat = createServerFn({ method: "POST" })
  .inputValidator((input: { messages: ChatMessage[] }) => {
    const messages = Array.isArray(input?.messages) ? input.messages : [];
    if (messages.length === 0 || messages.length > 10) throw new Error("Invalid message count");
    for (const m of messages) {
      if ((m?.role !== "user" && m?.role !== "assistant") || typeof m.content !== "string") {
        throw new Error("Invalid message");
      }
      if (m.content.length > 1000) throw new Error("Message too long");
    }
    return { messages };
  })
  .handler(async ({ data }): Promise<{ reply: string; aiGenerated: true }> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const forwarded = getRequestHeader("x-forwarded-for") ?? "";
    const ip = (forwarded ? (forwarded.split(",")[0]?.trim() ?? "") : "") || "unknown";
    if (rateLimited(`site:${ip}`)) {
      return { reply: "You are sending messages too quickly — please wait a minute and try again.", aiGenerated: true };
    }

    const instructions = [
      "You are the friendly sales & support assistant on the HCM Lite marketing website.",
      "Visitors are NOT logged in — answer questions about the product, pricing, licensing, demo and contacts.",
      "Use ONLY the product knowledge below; if something is not covered, say you are not sure and offer the owner's WhatsApp.",
      "Never invent prices, features or dates. Keep answers short (2-4 sentences). Reply in English or Roman Urdu to match the visitor.",
      "For purchases, demos or custom requirements, point visitors to: the Buy Now button, the Enterprise Demo booking form on this page, or the owner's WhatsApp (+92-314-0263346).",
      "You cannot access company data, create accounts, or issue license keys — say so and direct them to the owner.",
      SITE_KNOWLEDGE,
    ].join("\n");

    // RAG-style grounding: the product knowledge above is the retrieval context;
    // user turns are sanitized against prompt-injection / impersonation attempts.
    const turns = data.messages
      .slice(-10)
      .map((m) => ({ role: m.role, content: sanitizeUserText(m.content) }));

    const started = Date.now();
    let reply = "";
    let success = true;

    // Primary: Google Gemini (owner-provided key, low-cost flash model).
    // Fallback: Lovable AI Gateway when the key is missing or the call fails.
    const geminiReply = await callGemini(instructions, turns);
    if (geminiReply) {
      reply = geminiReply;
    } else {
      const input: unknown[] = turns.map((m) => ({
        role: m.role,
        content: [{ type: "input_text", text: m.content }],
      }));
      try {
        const response = await callModel(input, instructions, false);
        reply = extractText(response) || "Maaf kijiye, jawab nahi ban saka — dobara poochein ya WhatsApp par rabta karein.";
      } catch (e) {
        success = false;
        reply =
          e instanceof GatewayError && e.code === "rate_limited"
            ? "The AI service is busy right now — please try again in a moment, or WhatsApp us."
            : "The assistant is unavailable right now. Please try again shortly, or WhatsApp us at +92-314-0263346.";
        console.error("[siteChat]", e);
      }
    }

    // Best-effort logging (user_id nullable for public visitors).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("ai_logs").insert({
        user_id: null,
        feature: "site_chat",
        question: (data.messages.at(-1)?.content ?? "").slice(0, 2000),
        answer: reply.slice(0, 4000),
        success,
        latency_ms: Math.round(Date.now() - started),
        tool_calls: null as never,
      });
    } catch (e) {
      console.error("[ai_logs] site insert failed:", e);
    }

    return { reply, aiGenerated: true };
  });
