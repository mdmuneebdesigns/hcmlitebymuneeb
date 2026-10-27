import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, CheckCircle2, Loader2, Mail, MessageCircle, Phone, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { submitEnterpriseLead } from "@/lib/leads.functions";
import {
  CONTACT_WHATSAPP_DISPLAY,
  CONTACT_WHATSAPP_URL,
  CONTACT_US_DESK_DISPLAY,
  CONTACT_US_DESK_TEL,
  LEAD_INQUIRY_TYPES,
  LEAD_TEAM_SIZES,
  OWNER_EMAIL,
} from "@/lib/leads";
import { FAQ_ITEMS } from "@/lib/seo";

/** Inline + floating owner-contact badges (WhatsApp PK desk, US desk, email). */
export function OwnerContactBadges({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className ?? ""}`}>
      <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
        <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-600/90">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp / PK Desk: {CONTACT_WHATSAPP_DISPLAY}
        </Button>
      </a>
      <a href={CONTACT_US_DESK_TEL}>
        <Button size="sm" variant="outline">
          <Phone className="h-3.5 w-3.5" /> US Desk: {CONTACT_US_DESK_DISPLAY}
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
 * issues can never show a false "Send failed" or lose a lead.
 */
export function EnterpriseDemoSection() {
  const submitLead = useServerFn(submitEnterpriseLead);
  const [status, setStatus] = useState<Status>("idle");
  const [showModal, setShowModal] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Honeypot: bots fill it, humans never see it — pretend success silently.
    if (honey) {
      setShowModal(true);
      setStatus("sent");
      return;
    }
    setStatus("sending");
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
        },
      });
      if (!res.stored) throw new Error(res.error);
      // Stored in the database — success modal shows regardless of email relay.
      setShowModal(true);
      setStatus("sent");
      if (!res.emailed) {
        toast.success("✅ Inquiry logged — email delivery pending, WhatsApp par fastest response.");
      }
    } catch (err) {
      setStatus("idle");
      const msg = err instanceof Error ? err.message : "Submission failed";
      toast.error(msg + " — ya WhatsApp par Rabta karein: " + CONTACT_WHATSAPP_DISPLAY);
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
                    <Loader2 className="h-4 w-4 animate-spin" /> Logging your inquiry…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> 💼 Book Enterprise Demo / Buy License
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Har submission database mein log hoti hai aur Muhammad Muneeb ko deliver hoti hai — WhatsApp pe fastest
                response milta hai.
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* Emerald success modal — shown as soon as the lead is stored. */}
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
