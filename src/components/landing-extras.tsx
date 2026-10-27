import { useRef, useState } from "react";
import { Building2, CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FAQ_ITEMS } from "@/lib/seo";

const FORMSUBMIT_ENDPOINT = "https://formsubmit.co/ajax/mdmuneebdesigns@gmail.com";
const OWNER_EMAIL = "mdmuneebdesigns@gmail.com";

const TEAM_SIZES = [
  "1–25 Employees",
  "26–100 Employees",
  "101–500 Employees",
  "500+ Enterprise",
  "Custom White-Label / Source Code License",
];

const INQUIRY_TYPES = [
  "Book a Live Product Demo",
  "Purchase SaaS Subscription",
  "Custom On-Premise / Cloud Deployment",
  "White-Label Source Code Acquisition",
  "AI / Computer Vision Integration Consultation",
];

type Status = "idle" | "sending" | "sent" | "error";

/**
 * “Book an Enterprise Demo & Custom Deployment” section — submissions are
 * delivered straight to the owner's inbox through FormSubmit.co
 * (mdmuneebdesigns@gmail.com), as chosen by the product owner.
 * Primary path: AJAX fetch. Fallback: classic HTML form POST (spec-required).
 */
export function EnterpriseDemoSection() {
  const [status, setStatus] = useState<Status>("idle");
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    team_size: TEAM_SIZES[0]!,
    inquiry_type: INQUIRY_TYPES[0]!,
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
      setStatus("sent");
      return;
    }
    setStatus("sending");
    // Give up after 20s so the UI never hangs on a slow or blocked network.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(FORMSUBMIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          ...form,
          _subject: "🚀 New HCM Lite Enterprise Demo / License Inquiry!",
          _template: "table",
          _captcha: "false",
          _honey: honey,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`FormSubmit responded ${res.status}`);
      setStatus("sent");
      toast.success("✅ Inquiry received — sent to Muhammad Muneeb.");
    } catch {
      clearTimeout(timer);
      setStatus("error");
      toast.error("Send failed — please email " + OWNER_EMAIL + " directly.");
    }
  }

  if (status === "sent") {
    return (
      <section id="enterprise" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16">
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-10 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            ✅ Inquiry Received!
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your request has been sent directly to Muhammad Muneeb ({OWNER_EMAIL}). You'll get a
            reply within 24 hours — keep an eye on your inbox (and spam folder).
          </p>
        </div>
      </section>
    );
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
              Bring HCM Lite to Your Organization — Book a Personalized Demo or Acquire Full-Stack
              License
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Looking to deploy AI-powered biometric attendance, automated payroll and custom HR
              workflows for your team? Fill out the form below and Muhammad Muneeb will get back to
              you within 24 hours.
            </p>
          </div>

          <form
            ref={formRef}
            action="https://formsubmit.co/mdmuneebdesigns@gmail.com"
            method="POST"
            onSubmit={handleSubmit}
            className="mt-8 grid gap-4 md:grid-cols-2"
          >
            {/* Hidden FormSubmit configuration */}
            <input type="hidden" name="_subject" value="🚀 New HCM Lite Enterprise Demo / License Inquiry!" />
            <input type="hidden" name="_template" value="table" />
            <input type="hidden" name="_captcha" value="false" />
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
                {TEAM_SIZES.map((t) => (
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
                {INQUIRY_TYPES.map((t) => (
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
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending your inquiry…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> 💼 Book Enterprise Demo / Buy License
                  </>
                )}
              </Button>
              {status === "error" && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Direct email fallback:{" "}
                  <a href={`mailto:${OWNER_EMAIL}`} className="text-primary underline">
                    {OWNER_EMAIL}
                  </a>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Submissions go straight to {OWNER_EMAIL} — no data is stored on this site.
              </p>
            </div>
          </form>
        </div>
      </div>
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
