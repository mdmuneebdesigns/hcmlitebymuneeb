import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BadgeCheck,
  Bot,
  Camera,
  FileText,
  Fingerprint,
  Globe2,
  KeyRound,
  Landmark,
  Lock,
  MapPin,
  Receipt,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { EnterpriseDemoSection, HcmFaqSection, OwnerContactBadges, FloatingBuyWhatsApp } from "@/components/landing-extras";
import { DemoMode, startDemoMode } from "@/components/demo-mode";
import { supabase } from "@/integrations/supabase/client";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "AI Engine", href: "#ai-engine" },
  { label: "Pricing", href: "#pricing" },
  { label: "Blueprint", href: "#architecture" },
  { label: "FAQ", href: "#faq" },
  { label: "Enterprise Demo", href: "#enterprise" },
];

/** Pricing cards — launch pricing with the crossed-out ("cutting") anchor price. */
function PricingSection({ onStartDemo }: { onStartDemo: () => void }) {
  const plans = [
    {
      name: "Interactive Demo Trial",
      price: "Free",
      note: "5 Actions Per Module",
      cut: null as string | null,
      features: [
        "Try all 9 modules hands-on",
        "5 employees · 5 check-ins · 5 leaves",
        "5 PDF payslip receipts · 5 AI queries",
        "No credit card, no signup data",
      ],
      cta: (
        <Button size="lg" variant="outline" className="w-full" onClick={onStartDemo}>
          <Zap className="h-4 w-4" /> ⚡ Start Interactive Demo
        </Button>
      ),
    },
    {
      name: "Monthly Cloud Subscription",
      price: "$49",
      unit: "/month",
      note: "30-Day License · Strictly 1 Device Lock",
      cut: "$100",
      features: [
        "Unlimited employees & attendance",
        "Automated payroll + unlimited PDF payslips",
        "Role-scoped AI assistant (Roman Urdu)",
        "Cloud hosting, backups & updates included",
      ],
      highlight: true,
      cta: (
        <a href="#enterprise" className="w-full">
          <Button size="lg" className="gradient-brand w-full text-white">
            💼 Subscribe / Book Demo
          </Button>
        </a>
      ),
    },
    {
      name: "Lifetime Enterprise / One-Time License",
      price: "$499",
      unit: " one-time",
      note: "Lifetime Validity + Source / Custom Setup",
      cut: "$999",
      features: [
        "One-time payment, lifetime validity",
        "Full source code & white-label option",
        "Custom deployment (on-premise or cloud)",
        "Priority WhatsApp + US-desk support",
      ],
      cta: (
        <a href="#enterprise" className="w-full">
          <Button size="lg" variant="outline" className="w-full">
            🔑 Acquire Lifetime License
          </Button>
        </a>
      ),
    },
  ];

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <h2 className="text-center text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
        Start free with the interactive demo — then choose a 30-day cloud subscription or a one-time lifetime license.
        Launch pricing, limited time.
      </p>
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg ${
              p.highlight ? "border-primary/60 shadow-lg ring-1 ring-primary/30" : "border-border/60"
            }`}
          >
            {p.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-brand px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Most Popular
              </span>
            )}
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{p.name}</h3>
            <div className="mt-3 flex items-baseline gap-2">
              {p.cut && (
                <span className="text-lg font-medium text-muted-foreground/70 line-through">{p.cut}</span>
              )}
              <span className={`text-4xl font-bold tracking-tight ${p.cut ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                {p.price}
              </span>
              {p.unit && <span className="text-sm text-muted-foreground">{p.unit}</span>}
            </div>
            <p className="mt-1 text-xs font-medium text-primary">{p.note}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> {f}
                </li>
              ))}
            </ul>
            <div className="mt-5">{p.cta}</div>
          </div>
        ))}
      </div>
      <OwnerContactBadges className="mt-8" />
    </section>
  );
}

/** Types the Roman-Urdu leave request, then reveals the auto-filled JSON form. */
function AiTypingPreview() {
  const PROMPT = "Mujhe Monday aur Tuesday chutti chahiye";
  const [typed, setTyped] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typed >= PROMPT.length) {
      const t = setTimeout(() => setDone(true), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTyped((n) => n + 1), 65);
    return () => clearTimeout(t);
  }, [typed, PROMPT.length]);

  return (
    <div className="space-y-2 font-mono text-[11px]">
      <div className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-foreground">
        {PROMPT.slice(0, typed)}
        {!done && <span className="animate-pulse text-primary">▍</span>}
      </div>
      {done && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-300">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600/80 dark:text-emerald-400/80">
            Leave form auto-filled
          </p>
          <pre className="mt-1 whitespace-pre-wrap">{`{
  "type": "Annual",
  "from": "Monday",
  "to": "Tuesday",
  "days": 2,
  "reason": "Personal"
}`}</pre>
        </div>
      )}
    </div>
  );
}

/** Animated geofence radar — pure CSS, no images. */
function GeofenceRadar() {
  return (
    <div className="relative mx-auto h-28 w-28">
      <div className="absolute inset-0 rounded-full border border-emerald-500/40" />
      <div className="absolute inset-3 rounded-full border border-indigo-500/40" />
      <div className="absolute inset-7 rounded-full border border-violet-500/40" />
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "conic-gradient(from 0deg, rgba(16,185,129,0.45), transparent 25%)",
          animation: "spin 3.2s linear infinite",
        }}
      />
      <MapPin className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400" />
      <Camera className="absolute right-2 top-2 h-3.5 w-3.5 text-indigo-500" />
      <Fingerprint className="absolute bottom-2 left-2 h-3.5 w-3.5 text-violet-500" />
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();

  /** Launch Company Setup — visitors must authenticate first. */
  async function launchSetup() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      navigate({ to: "/setup", replace: true });
    } else {
      navigate({ to: "/auth", search: { redirect: "/setup" }, replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky glassmorphism navbar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <a href="#top" className="flex items-center">
            <BrandLogo size={34} showWordmark />
          </a>
          <nav className="hidden items-center gap-4 text-sm text-muted-foreground lg:flex xl:gap-5">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="whitespace-nowrap transition-colors hover:text-foreground">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <a href="#enterprise" className="hidden xl:block whitespace-nowrap">
              <Button variant="outline" size="sm">
                💼 Book Enterprise Demo
              </Button>
            </a>
            <ThemeToggle floating={false} className="relative bottom-auto left-auto" />
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/auth" })}>
              Sign In
            </Button>
            <Button size="sm" className="gradient-brand text-white" onClick={launchSetup}>
              🚀 Setup Your Company
            </Button>
          </div>
        </div>
      </header>

      <main>
      {/* Hero */}
      <section id="top" className="relative overflow-hidden px-4 py-20 sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{ background: "linear-gradient(120deg, #4f46e5, #7c3aed, #10b981)" }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            ✨ AI-Powered HR, Biometric Geofence &amp; Automated Payroll
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Run your entire company HR in minutes —{" "}
            <span className="text-gradient-brand">attendance, leave, payroll &amp; AI</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            HCM Lite is an enterprise-grade Human Capital Management suite: camera face-check attendance with GPS
            geofencing, automated Pakistani tax-slab payroll with instant PDF payslips, role-scoped AI assistance in
            Roman Urdu and English, and immutable audit logs — all in one clean workspace.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="gradient-brand text-white shadow-lg" onClick={launchSetup}>
              Launch Company Setup
            </Button>
            <Button size="lg" variant="outline" onClick={startDemoMode}>
              <Zap className="h-4 w-4" /> ⚡ Explore Live Interactive Demo
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Demo mode mein 9 modules ke 5-5 actions free — phir apna workspace launch karein.
          </p>
        </div>
      </section>

      {/* Interactive feature bento grid */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Everything your HR team needs</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
          Nine modules, three roles, zero dummy data — every number comes from real activity recorded in the app.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Card 1 — Camera face detection + GPS geofence */}
          <Card id="attendance" className="scroll-mt-24 border-border/60 transition-shadow hover:shadow-lg">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand text-white">
                  <Camera className="h-4 w-4" />
                </span>
                Camera Face Detection + GPS Geofence
              </div>
              <GeofenceRadar />
              <p className="text-sm text-muted-foreground">
                Live camera frame analysis at check-in/out, plus a Haversine GPS geofence around your office. Late
                after grace, half-day below the threshold — computed in Pakistan Standard Time.
              </p>
            </CardContent>
          </Card>

          {/* Card 2 — AI Assistant */}
          <Card id="ai-engine" className="scroll-mt-24 border-border/60 transition-shadow hover:shadow-lg">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand text-white">
                  <Bot className="h-4 w-4" />
                </span>
                Roman Urdu + English AI Assistant
              </div>
              <AiTypingPreview />
              <p className="text-sm text-muted-foreground">
                Role-scoped AI tools: smart leave parsing auto-fills the request form, HR gets headcount &amp;
                attendance summaries, Admin gets payroll cost insights. Every call is logged.
              </p>
            </CardContent>
          </Card>

          {/* Card 3 — Payroll */}
          <Card id="payroll" className="scroll-mt-24 border-border/60 transition-shadow hover:shadow-lg">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand text-white">
                  <Receipt className="h-4 w-4" />
                </span>
                Automated Pakistani Tax-Slab Payroll
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {[
                  ["Basic salary", "PKR 100,000"],
                  ["House rent (40%)", "+ PKR 40,000"],
                  ["Medical (10%)", "+ PKR 10,000"],
                  ["Absences & lates", "− auto-deducted"],
                  ["Income tax slab", "− auto-calculated"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-semibold text-foreground">{v}</span>
                  </div>
                ))}
              </div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Instant PDF payslips per employee, finalized runs stay immutable.
              </p>
            </CardContent>
          </Card>

          {/* Card 4 — RBAC + Audit (wide) */}
          <Card className="border-border/60 transition-shadow hover:shadow-lg md:col-span-2 lg:col-span-3">
            <CardContent className="grid gap-6 pt-6 md:grid-cols-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand text-white">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  Enterprise RBAC
                </div>
                <p className="text-sm text-muted-foreground">
                  Admin, HR and Employee roles enforced server-side on every request — the UI never decides access.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand text-white">
                    <ScrollText className="h-4 w-4" />
                  </span>
                  Immutable Audit Logs
                </div>
                <p className="text-sm text-muted-foreground">
                  Every privileged write records actor, action and before/after JSON — deletions included.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand text-white">
                    <Lock className="h-4 w-4" />
                  </span>
                  Row-Level Security
                </div>
                <p className="text-sm text-muted-foreground">
                  Salaries and audit trails are isolated per role scope in the database itself, not just the UI.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border/60 bg-muted/30 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight">How it works in 3 steps</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: UserCog,
                step: "1",
                title: "Create SaaS Account",
                body: "Sign up with a strong password (live strength checklist) or sign in — no anonymous access.",
              },
              {
                icon: Globe2,
                step: "2",
                title: "Configure Office & Geofence at /setup",
                body: "Company profile, office hours, grace and weekend rules plus your Karachi or custom GPS geofence.",
              },
              {
                icon: Users,
                step: "3",
                title: "Manage Employees, Attendance & AI Payroll",
                body: "Create HR and employee logins, run camera attendance, approve leave and generate payslips.",
              },
            ].map((s) => (
              <div key={s.step} className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand text-white">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="text-3xl font-bold text-muted-foreground/40">{s.step}</span>
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture blueprint */}
      <section id="architecture" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <div className="flex flex-col items-start gap-6 rounded-2xl border border-border/60 bg-card p-8 shadow-sm md:flex-row md:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl gradient-brand text-white">
            <Landmark className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-tight">Architecture Blueprint</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              16-table PostgreSQL schema with row-level security, server-side authorization on every function,
              Pakistan-timezone attendance engine, Haversine geofence pipeline, payroll math with active tax slabs,
              role-scoped AI tools and a full audit trail. The complete A-to-Z technical report is available inside
              the app — including a one-click PDF.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {["TanStack Start (React 19)", "Managed Cloud PostgreSQL + Auth", "RLS on all tables", "pdf-lib server PDFs", "AI Gateway", "Audit logs"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1 text-muted-foreground">
                  <BadgeCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> {t}
                </span>
              ))}
            </div>
          </div>
          <Button className="gradient-brand shrink-0 text-white" onClick={launchSetup}>
            Start the guided setup
          </Button>
        </div>
      </section>

      <HcmFaqSection />
      <PricingSection onStartDemo={startDemoMode} />
      <EnterpriseDemoSection />
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <BrandLogo size={28} showWordmark />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> AI-Powered HR, Biometric Attendance &amp; Payroll
          </p>
          <div className="flex items-center gap-3">
            <a href="#enterprise" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
              💼 Book Enterprise Demo
            </a>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/auth" })}>
              Sign In
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-6 max-w-6xl border-t border-border/40 pt-6">
          <OwnerContactBadges />
        </div>
      </footer>
      <FloatingBuyWhatsApp />
      <DemoMode />
    </div>
  );
}
