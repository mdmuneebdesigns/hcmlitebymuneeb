import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Building2, CheckCircle2, Loader2, Mail, MessageCircle, Phone, Send, ShoppingCart, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { siteChat, type ChatMessage } from "@/lib/ai.functions";
import { submitEnterpriseLead } from "@/lib/leads.functions";
import {
  CONTACT_WHATSAPP_DISPLAY,
  CONTACT_WHATSAPP_URL,
  CONTACT_PK_CALL_TEL,
  CONTACT_US_DESK_DISPLAY,
  CONTACT_US_WHATSAPP_URL,
  LEAD_INQUIRY_TYPES,
  LEAD_TEAM_SIZES,
  OWNER_EMAIL,
} from "@/lib/leads";
import { FAQ_ITEMS } from "@/lib/seo";

const SITE_PROMPTS = [
  "Price kitni hai?",
  "Demo kaise try karun?",
  "Kaun se modules hain?",
  "Contact number kya hai?",
];

/**
 * Public AI assistant for website visitors (no login needed): answers questions
 * about pricing, modules, demo, licensing and contacts. AI-generated badge shown.
 */
function SiteAssistant() {
  const chatFn = useServerFn(siteChat);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setText("");
    setBusy(true);
    try {
      const res = await chatFn({ data: { messages: next.slice(-10) } });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Assistant abhi available nahi — thori dair baad try karein, ya WhatsApp karein." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full gradient-brand text-white shadow-lg ring-4 ring-primary/20 transition-transform hover:scale-105"
        aria-label={open ? "Close assistant" : "Ask AI assistant"}
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </button>
      {open && (
        <div className="fixed bottom-44 right-5 z-50 flex h-[440px] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">HCM Lite Assist</span>
              <Badge variant="secondary" className="text-[10px]">AI-generated</Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Assalam! Main HCM Lite ka website assistant hoon — pricing, modules, demo ya license ke baare mein poochein.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SITE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="rounded-full border border-input bg-background px-3 py-1 text-xs text-foreground hover:bg-accent"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={
                    m.role === "user"
                      ? "inline-block max-w-[85%] rounded-lg bg-primary px-3 py-2 text-left text-sm text-primary-foreground"
                      : "inline-block max-w-[90%] rounded-lg bg-muted px-3 py-2 text-left text-sm text-foreground"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Soch raha hoon…</p>}
          </div>
          <form
            className="flex gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask anything… (English / Roman Urdu)"
              className="text-sm"
            />
            <Button type="submit" size="icon" disabled={busy} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}

/**
 * Floating bottom-right stack, always on top (z-50):
 *   1. AI assistant toggle (opens the public Q&A panel above the stack).
 *   2. Attractive pulsing "Buy Now" pill → scrolls to the licensing form.
 *   3. Green WhatsApp chat circle.
 * Nothing can hide behind these buttons — the stack owns the corner on
 * every public page.
 */
export function FloatingBuyWhatsApp() {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5">
      <SiteAssistant />
      <a
        href="#enterprise"
        className="group relative flex items-center gap-2 rounded-full gradient-brand px-4 py-2.5 text-sm font-bold text-white shadow-xl ring-4 ring-primary/20 transition-transform hover:scale-105"
        aria-label="Buy HCM Lite license"
      >
        <span aria-hidden className="absolute inset-0 -z-10 animate-ping rounded-full gradient-brand opacity-30" />
        <ShoppingCart className="h-4 w-4" />
        Buy Now — from $49
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow">
          Sale
        </span>
      </a>
      <a
        href={CONTACT_WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircle className="h-5 w-5" />
      </a>
    </div>
  );
}

/** Inline owner-contact badges — PK number (WhatsApp + call) and US desk (WhatsApp only). */
export function OwnerContactBadges({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className ?? ""}`}>
      <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
        <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-600/90">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp / PK Desk: {CONTACT_WHATSAPP_DISPLAY}
        </Button>
      </a>
      <a href={CONTACT_PK_CALL_TEL}>
        <Button size="sm" variant="outline">
          <Phone className="h-3.5 w-3.5" /> Call (PK): {CONTACT_WHATSAPP_DISPLAY}
        </Button>
      </a>
      <a href={CONTACT_US_WHATSAPP_URL} target="_blank" rel="noreferrer">
        <Button size="sm" variant="outline" className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400">
          <MessageCircle className="h-3.5 w-3.5" /> US Desk (WhatsApp only): {CONTACT_US_DESK_DISPLAY}
        </Button>
      </a>
      <a href={`mailto:${OWNER_EMAIL}`}>
        <Button size="sm" variant="ghost">
          <Mail className="h-3.5 w-3.5" /> {OWNER_EMAIL}
        </Button>
      </a>
    </div>
  );
}

type Status = "idle" | "sending" | "sent";

/**
 * “Book an Enterprise Demo & Custom Deployment” section. Every submission is
 * stored in the enterprise_leads table FIRST (server-side), then forwarded to
 * the owner's FormSubmit inbox from the server — so browser/iframe network
 * issues can never show a false "Send failed" or lose a lead. The submit path
 * is fast: one server call (DB insert + bounded 8s email attempt), no page
 * navigation.
 */
export function EnterpriseDemoSection() {
  const submitLead = useServerFn(submitEnterpriseLead);
  const [status, setStatus] = useState<Status>("idle");
  const [showModal, setShowModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Native FormSubmit form — a real browser POST into a hidden iframe so the
  // owner's email is delivered in the background, without ever navigating the
  // page or slowing the submit button down.
  const nativeFormRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    team_size: LEAD_TEAM_SIZES[0] as string,
    inquiry_type: LEAD_INQUIRY_TYPES[0] as string,
    message: "",
  });
  const [honey, setHoney] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const valid =
    form.name.trim().length > 1 &&
    /.+@.+\..+/.test(form.email) &&
    form.phone.trim().length > 5 &&
    form.company.trim().length > 1 &&
    form.message.trim().length > 5;

  // Redirect target for the hidden-iframe FormSubmit POST — set after mount
  // (SSR-safe, no hydration mismatch).
  const [nextUrl, setNextUrl] = useState("");
  useEffect(() => {
    setNextUrl(window.location.origin + "/welcome?success=true");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Honeypot: bots fill it, humans never see it — pretend success silently.
    if (honey) {
      setShowModal(true);
      setStatus("sent");
      return;
    }
    setStatus("sending");
    setSubmitError(null);
    // Store the lead in the database first — a lead is never lost. _skipEmail
    // keeps the server call fast; the hidden-iframe browser POST below
    // delivers the email in parallel without blocking the UI.
    try {
      const res = await submitLead({
        data: {
          fullName: form.name,
          email: form.email,
          phone: form.phone,
          companyName: form.company,
          teamSize: form.team_size,
          inquiryType: form.inquiry_type,
          message: form.message,
          _honey: honey,
          _skipEmail: true,
        },
      });
      if (res.stored) {
        setStatus("sent");
        setShowModal(true);
        nativeFormRef.current?.submit();
      } else {
        setStatus("idle");
        setSubmitError(res.error);
      }
    } catch {
      setStatus("idle");
      setSubmitError("Aap ki request save nahi ho saki — WhatsApp ya email par seedha rabta karein.");
    }
  }

  const field =
    "w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <section id="enterprise" className="scroll-mt-20 border-y border-border/60 bg-muted/30 px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-8 shadow-lg backdrop-blur-md sm:p-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
              <Building2 className="h-3.5 w-3.5" /> 🚀 Enterprise Licensing &amp; Custom Deployment
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
              Bring HCM Lite to Your Organization — Book a Personalized Demo or Acquire Full-Stack License
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Looking to deploy AI-powered biometric attendance, automated payroll and custom HR workflows for your
              team? Fill out the form below and Muhammad Muneeb will get back to you within 24 hours.
            </p>
            <OwnerContactBadges className="mt-5" />
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
            {/* Honeypot spam protection */}
            <input
              type="text"
              name="_honey"
              value={honey}
              onChange={(e) => setHoney(e.target.value)}
              style={{ display: "none" }}
              tabIndex={-1}
              autoComplete="off"
            />

            <div className="space-y-1.5">
              <Label htmlFor="demo-name">Full Name *</Label>
              <Input
                id="demo-name"
                name="name"
                required
                placeholder="e.g. Ahmed Raza"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-email">Work Email *</Label>
              <Input
                id="demo-email"
                name="email"
                type="email"
                required
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-phone">Phone / WhatsApp Number *</Label>
              <Input
                id="demo-phone"
                name="phone"
                required
                placeholder="+92 300 1234567"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-company">Company / Organization Name *</Label>
              <Input
                id="demo-company"
                name="company"
                required
                placeholder="e.g. Saylani Welfare Trust"
                value={form.company}
                onChange={(e) => update("company", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-team">Team Size / Employees Count</Label>
              <select
                id="demo-team"
                name="team_size"
                className={field}
                value={form.team_size}
                onChange={(e) => update("team_size", e.target.value)}
              >
                {LEAD_TEAM_SIZES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-type">Inquiry Type</Label>
              <select
                id="demo-type"
                name="inquiry_type"
                className={field}
                value={form.inquiry_type}
                onChange={(e) => update("inquiry_type", e.target.value)}
              >
                {LEAD_INQUIRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="demo-message">Project Details / Requirements *</Label>
              <Textarea
                id="demo-message"
                name="message"
                required
                rows={4}
                placeholder="Tell us about your organization, headcount, offices and what you'd like to deploy…"
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
              />
            </div>
            <div className="flex flex-col items-center gap-3 md:col-span-2">
              <Button
                type="submit"
                size="lg"
                disabled={!valid || status === "sending"}
                className="gradient-brand w-full text-white shadow-lg sm:w-auto"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> 💼 Book Enterprise Demo / Buy License
                  </>
                )}
              </Button>
              {submitError && (
                <p className="text-xs font-medium text-destructive">{submitError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Aap ki inquiry secure save hoti hai aur seedha Muhammad Muneeb tak pohnchti hai —
                WhatsApp par reply sab se fastest hota hai.
              </p>
            </div>
          </form>

          {/* Hidden native FormSubmit form — browser POST into a hidden iframe. */}
          <iframe name="hcm-lead-submit" title="" className="hidden" aria-hidden="true" tabIndex={-1} />
          <form
            ref={nativeFormRef}
            action="https://formsubmit.co/mdmuneebdesigns@gmail.com"
            method="POST"
            target="hcm-lead-submit"
            className="hidden"
            aria-hidden="true"
          >
            <input type="hidden" name="name" value={form.name} />
            <input type="hidden" name="email" value={form.email} />
            <input type="hidden" name="phone" value={form.phone} />
            <input type="hidden" name="company" value={form.company} />
            <input type="hidden" name="team_size" value={form.team_size} />
            <input type="hidden" name="inquiry_type" value={form.inquiry_type} />
            <input type="hidden" name="message" value={form.message} />
            <input type="hidden" name="_subject" value="New HCM Lite License Inquiry!" />
            <input type="hidden" name="_captcha" value="false" />
            <input type="hidden" name="_next" value={nextUrl} />
          </form>
        </div>
      </div>

      {/* Emerald success modal — shown when the lead is stored / on return. */}
      {showModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-500/40 bg-card p-8 text-center shadow-2xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 h-8 w-8"
              onClick={() => {
                setShowModal(false);
                setStatus("idle");
                setSubmitError(null);
                setForm({
                  name: "",
                  email: "",
                  phone: "",
                  company: "",
                  team_size: LEAD_TEAM_SIZES[0] as string,
                  inquiry_type: LEAD_INQUIRY_TYPES[0] as string,
                  message: "",
                });
              }}
              aria-label="Close"
            >
              ✕
            </Button>
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600 dark:text-emerald-400" />
            <h3 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
              ✅ Request Received!
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your inquiry is logged for Muhammad Muneeb. Aap ko 24 hours ke andar reply milega — WhatsApp par message
              karein to response fastest hota hai.
            </p>
            <div className="mt-5">
              <OwnerContactBadges />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** AEO FAQ accordion — mirrors the FAQPage JSON-LD schema item for item. */
export function HcmFaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16">
      <h2 className="text-center text-3xl font-bold tracking-tight">
        Frequently Asked Questions (AI &amp; Architecture)
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
        How the biometric engine, AI assistant, payroll math and security model actually work.
      </p>
      <Accordion type="single" collapsible className="mt-8">
        {FAQ_ITEMS.map((item, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger className="text-left text-sm font-semibold">{item.q}</AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
