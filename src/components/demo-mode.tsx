import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Bot,
  Building2,
  CalendarClock,
  Camera,
  Download,
  FileText,
  Fingerprint,
  MessageCircle,
  Send,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { submitEnterpriseLead } from "@/lib/leads.functions";
import { CONTACT_WHATSAPP_DISPLAY, CONTACT_WHATSAPP_URL, CONTACT_US_DESK_DISPLAY, CONTACT_US_WHATSAPP_URL, OWNER_EMAIL, LEAD_INQUIRY_TYPES } from "@/lib/leads";
import {
  DEMO_QUOTA_LABELS,
  DEMO_QUOTA_LIMIT,
  clearDemoState,
  consumeQuota,
  loadDemoState,
  quotaComplete,
  saveDemoState,
  startDemo,
  type DemoAttendanceRecord,
  type DemoQuotaKey,
  type DemoState,
} from "@/lib/demo";
import { supabase } from "@/integrations/supabase/client";

export const DEMO_OPEN_EVENT = "hcm-demo-open";

type ConsumeFn = (key: DemoQuotaKey, apply?: (s: DemoState) => DemoState) => boolean;

/** Start (or resume) the interactive demo — call from any CTA on public pages. */
export function startDemoMode(): void {
  if (typeof window === "undefined") return;
  startDemo();
  saveDemoState(loadDemoState()!);
  window.dispatchEvent(new CustomEvent(DEMO_OPEN_EVENT));
}

const DEPARTMENTS = ["Engineering", "Operations", "Finance", "HR", "Sales", "Support"];
const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Unpaid"];

const AI_CANNED: { q: string; a: string }[] = [
  { q: "Mujhe Monday aur Tuesday chutti chahiye", a: "Samajh gaya! Main ne 2 din ki Annual leave (Monday–Tuesday) ke liye form pre-fill kar diya hai — reason: Personal. Aap review kar ke submit kar sakte hain." },
  { q: "How many employees are there?", a: "Aap ke demo workspace mein abhi {n} employees hain. Full version mein ye number real-time database se aata hai, with department-wise breakdown." },
  { q: "Who was late today?", a: "Demo mode mein ye report aap ke real attendance se banti hai. Abhi ke demo punches ke against: jo check-in office start + 15 min grace ke baad hua woh 'Late' mark hota hai (PKT timezone)." },
  { q: "Company late policy kya hai?", a: "Office start ke baad 15 minute grace period hai. Grace khatam hone ke baad check-in par 'Late' lagta hai, aur 3 lates par 0.5 day deduction hota hai." },
  { q: "Payroll summary do", a: "Gross = Basic + 40% house rent + 10% medical. Us ke baad absences, half-days, lates aur income-tax slab deduct hota hai. Demo Receipts tab mein aap ne sample payslip generate ki hai." },
];

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function monthLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Full-screen Interactive Demo overlay. Mounted on public pages; opens
 * automatically when a demo session is active in localStorage and never
 * auto-closes — only "End Demo" (or quota upsell) closes it.
 */
export function DemoMode() {
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [tab, setTab] = useState<DemoQuotaKey>("employees");
  const [quotaModal, setQuotaModal] = useState<DemoQuotaKey | null>(null);
  const [contactModal, setContactModal] = useState(false);

  useEffect(() => {
    const state = loadDemoState();
    if (state) setDemo(state);
    const open = () => setDemo(startDemo());
    window.addEventListener(DEMO_OPEN_EVENT, open);
    return () => window.removeEventListener(DEMO_OPEN_EVENT, open);
  }, []);

  function update(next: DemoState) {
    saveDemoState(next);
    setDemo(next);
  }

  /** One demo action = one quota unit; 6th attempt opens the upsell modal. */
  function consume(key: DemoQuotaKey, apply?: (s: DemoState) => DemoState): boolean {
    if (!demo) return false;
    const result = consumeQuota(demo, key);
    if (!result.ok) {
      setQuotaModal(key);
      return false;
    }
    const next = apply ? apply(result.state) : result.state;
    update(next);
    // Fire-and-forget demo analytics (anon insert-only table).
    void supabase.from("demo_events").insert({ demo_id: next.startedAt, action: key }).then(() => undefined, () => undefined);
    if (quotaComplete(next)) {
      setQuotaModal(key);
    }
    return true;
  }

  function endDemo() {
    clearDemoState();
    setDemo(null);
    setQuotaModal(null);
    setContactModal(false);
    toast.success("Demo ended — jab demo explore karna ho, wapas start kar lein!");
  }

  if (!demo) return null;

  const quotaText = (Object.keys(DEMO_QUOTA_LABELS) as DemoQuotaKey[])
    .map((k) => `${DEMO_QUOTA_LABELS[k]} (${demo.quotas[k]}/${DEMO_QUOTA_LIMIT})`)
    .join(" | ");

  return (
    <>
      <div className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground">
        {/* Sticky demo banner — quotas + upgrade + end demo. Never auto-dismisses. */}
        <div className="border-b border-primary/30 bg-primary/10 px-3 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2 text-xs sm:justify-between">
            <p className="font-medium text-foreground">
              🧪 Interactive Demo Active — Quotas: {quotaText}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" className="gradient-brand h-7 px-3 text-xs text-white" onClick={() => setContactModal(true)}>
                ⬆️ Upgrade to Full License
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={endDemo}>
                End Demo
              </Button>
            </div>
          </div>
        </div>

        {/* Module tabs */}
        <div className="border-b border-border/60 bg-card/60 px-3 py-2">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-2">
            {(
              [
                ["employees", Users, "Employees"],
                ["checkins", Camera, "Attendance"],
                ["leaves", CalendarClock, "Leave"],
                ["receipts", FileText, "Payroll & Receipts"],
                ["ai", Bot, "AI Assistant"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label} ({demo.quotas[key]}/{DEMO_QUOTA_LIMIT})
              </button>
            ))}
          </div>
        </div>

        {/* Panel */}
        <div className="flex-1 overflow-auto px-4 py-6">
          <div className="mx-auto max-w-4xl">
            <p className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Demo workspace — sab kuch aap ke browser mein chal raha hai, real company data touch nahi ho raha. Har module mein {DEMO_QUOTA_LIMIT} actions free hain.
            </p>
            {tab === "employees" && <EmployeesPanel demo={demo} consume={consume} />}
            {tab === "checkins" && <AttendancePanel demo={demo} consume={consume} />}
            {tab === "leaves" && <LeavePanel demo={demo} consume={consume} />}
            {tab === "receipts" && <ReceiptsPanel demo={demo} consume={consume} />}
            {tab === "ai" && <AiPanel demo={demo} consume={consume} />}
          </div>
        </div>
      </div>

      {/* Quota reached / upgrade modal */}
      {(quotaModal || contactModal) && (
        <QuotaModal
          quotaKey={quotaModal}
          onClose={() => {
            setQuotaModal(null);
            setContactModal(false);
          }}
          demoActive={!!demo}
        />
      )}
    </>
  );
}

function QuotaModal({ quotaKey, onClose, demoActive }: { quotaKey: DemoQuotaKey | null; onClose: () => void; demoActive: boolean }) {
  const submitLead = useServerFn(submitEnterpriseLead);
  const [showLicense, setShowLicense] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [sending, setSending] = useState(false);
  const [licenseSent, setLicenseSent] = useState(false);

  async function activateLicense(e: React.FormEvent) {
    e.preventDefault();
    if (!licenseKey.trim() || sending) return;
    setSending(true);
    try {
      const res = await submitLead({
        data: {
          fullName: "License Activation Request",
          email: OWNER_EMAIL,
          phone: CONTACT_WHATSAPP_DISPLAY,
          companyName: "License Key Activation",
          teamSize: "Custom White-Label / Source Code License",
          inquiryType: LEAD_INQUIRY_TYPES.find((t) => t === "License Key Activation") ?? LEAD_INQUIRY_TYPES[0]!,
          message: `Visitor wants to activate license key: ${licenseKey.trim()}`,
        },
      });
      if (res.stored) {
        setLicenseSent(true);
        toast.success("✅ License request logged — Muneeb will confirm your activation shortly.");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Could not log the request — WhatsApp par Rabta karein.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
        <Button variant="ghost" size="icon" className="absolute right-3 top-3 h-8 w-8" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
        <h3 className="text-xl font-bold tracking-tight">
          {quotaKey ? "🎯 Demo Quota Reached (5/5 Completed)!" : "🚀 Unlock the Full Power of HCM Lite"}
        </h3>
        {quotaKey && (
          <p className="mt-1 text-xs font-medium text-primary">{DEMO_QUOTA_LABELS[quotaKey]}: 5/5 used</p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          You have experienced the full power of HCM Lite! To unlock unlimited employees, payroll receipts, and your
          own production workspace, contact Admin Muhammad Muneeb.
        </p>
        {!licenseSent ? (
          <>
            <div className="mt-5 grid gap-2">
              <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="w-full">
                <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-600/90">
                  <MessageCircle className="h-4 w-4" /> 💬 Chat on WhatsApp ({CONTACT_WHATSAPP_DISPLAY})
                </Button>
              </a>
              <a href={CONTACT_US_WHATSAPP_URL} target="_blank" rel="noreferrer" className="w-full">
                <Button variant="outline" className="w-full">
                  <MessageCircle className="h-4 w-4" /> 💬 US Desk (WhatsApp): {CONTACT_US_DESK_DISPLAY}
                </Button>
              </a>
              <Button className="gradient-brand w-full text-white" onClick={() => setShowLicense((v) => !v)}>
                🔑 I Have a License Key — Activate Now
              </Button>
            </div>
            {showLicense && (
              <form onSubmit={activateLicense} className="mt-4 flex gap-2">
                <Input
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="e.g. HCML-XXXX-XXXX"
                  required
                />
                <Button type="submit" disabled={sending || !licenseKey.trim()} className="shrink-0">
                  {sending ? "Sending…" : "Activate"}
                </Button>
              </form>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Pricing: Monthly Cloud $49/month · Lifetime Enterprise $499 one-time ·{" "}
              <a href={`mailto:${OWNER_EMAIL}`} className="text-primary underline">
                {OWNER_EMAIL}
              </a>
            </p>
          </>
        ) : (
          <div className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            ✅ Request received — aap ki activation request Muneeb ke paas log ho gayi hai. WhatsApp ya US Desk par
            follow-up fastest hota hai.
          </div>
        )}
        {demoActive && (
          <Button variant="ghost" size="sm" className="mt-4 w-full text-xs" onClick={onClose}>
            Continue exploring the demo
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Panels ---------------- */

function EmployeesPanel({ demo, consume }: { demo: DemoState; consume: ConsumeFn }) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]!);
  const [salary, setSalary] = useState("100000");

  function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    const fullName = name.trim();
    if (!fullName) {
      toast.error("Employee name likhein");
      return;
    }
    if (!consume("employees", (s) => ({
      ...s,
      employees: [
        ...s.employees,
        {
          id: uid(),
          name: fullName,
          code: `EMP-${String(s.employees.length + 1).padStart(3, "0")}`,
          department,
          salary: Math.max(0, Number(salary) || 0),
        },
      ],
    }))) return;
    setName("");
    toast.success(`${fullName} added — demo directory mein show ho gaya.`);
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
      <form onSubmit={addEmployee} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" /> Add Employee ({demo.quotas.employees}/{DEMO_QUOTA_LIMIT})
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="demo-emp-name">Full name</Label>
          <Input id="demo-emp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bilal Ahmed" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="demo-emp-dept">Department</Label>
          <select
            id="demo-emp-dept"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="demo-emp-salary">Basic salary (PKR)</Label>
          <Input id="demo-emp-salary" type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} />
        </div>
        <Button type="submit" className="gradient-brand w-full text-white">
          <Send className="h-4 w-4" /> Create employee
        </Button>
      </form>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Demo directory</h3>
        {demo.employees.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Abhi koi employee nahi — pehla add karein.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {demo.employees.map((emp) => (
              <li key={emp.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{emp.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{emp.code}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {emp.department} · PKR {emp.salary.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AttendancePanel({ demo, consume }: { demo: DemoState; consume: ConsumeFn }) {
  const [selected, setSelected] = useState("");
  const employee = demo.employees.find((e) => e.id === selected) ?? demo.employees[0];

  function punch(kind: DemoAttendanceRecord["kind"]) {
    if (!employee) {
      toast.error("Pehle Employees tab se ek employee add karein");
      return;
    }
    const late = kind === "check-in" && demo.employees.indexOf(employee) % 3 === 2;
    if (!consume("checkins", (s) => ({
      ...s,
      attendance: [
        ...s.attendance,
        { id: uid(), employeeName: employee.name, kind, at: new Date().toISOString(), distanceM: 12 + Math.floor(Math.random() * 20), late },
      ],
    }))) return;
    toast.success(
      kind === "check-in"
        ? `✅ Check-in recorded — face verified, GPS ${late ? "inside geofence (late mark)" : "inside geofence"}.`
        : `✅ Check-out recorded for ${employee.name}.`,
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Camera className="h-4 w-4 text-primary" /> Camera + GPS Check-in ({demo.quotas.checkins}/{DEMO_QUOTA_LIMIT})
        </h3>
        {demo.employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Employees tab se pehle employee add karein.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="demo-att-emp">Employee</Label>
              <select
                id="demo-att-emp"
                value={employee?.id ?? ""}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {demo.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <Fingerprint className="h-4 w-4" /> Face check: passed · GPS: 12–32 m from office · Geo-fence: inside
            </div>
            <div className="flex gap-2">
              <Button className="gradient-brand flex-1 text-white" onClick={() => punch("check-in")}>
                📷 Check-in
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => punch("check-out")}>
                📷 Check-out
              </Button>
            </div>
          </>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Demo attendance log</h3>
        {demo.attendance.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Koi punch record nahi.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {demo.attendance.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{r.employeeName}</span>{" "}
                  <Badge variant={r.kind === "check-in" ? "default" : "secondary"} className="ml-1 text-[10px]">
                    {r.kind}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.at).toLocaleTimeString()} · {r.distanceM} m{r.late ? " · late" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LeavePanel({ demo, consume }: { demo: DemoState; consume: ConsumeFn }) {
  const [type, setType] = useState(LEAVE_TYPES[0]!);
  const [days, setDays] = useState("2");
  const [reason, setReason] = useState("");

  function applyLeave(e: React.FormEvent) {
    e.preventDefault();
    const employee = demo.employees[0];
    if (!employee) {
      toast.error("Pehle Employees tab se ek employee add karein");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("Reason likhein");
      return;
    }
    const n = Math.max(1, Math.min(30, Number(days) || 1));
    if (!consume("leaves", (s) => ({
      ...s,
      leaves: [
        ...s.leaves,
        {
          id: uid(),
          employeeName: employee.name,
          type,
          fromDate: new Date().toISOString().slice(0, 10),
          toDate: new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10),
          days: n,
          reason: reason.trim(),
        },
      ],
    }))) return;
    setReason("");
    toast.success("✅ Leave request submitted — HR approval ke liye pending.");
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={applyLeave} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" /> Apply Leave ({demo.quotas.leaves}/{DEMO_QUOTA_LIMIT})
        </h3>
        {demo.employees.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Employees tab se pehle employee add karein.</p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="demo-leave-type">Leave type</Label>
          <select
            id="demo-leave-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="demo-leave-days">Working days</Label>
          <Input id="demo-leave-days" type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="demo-leave-reason">Reason</Label>
          <Input id="demo-leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family function" />
        </div>
        <Button type="submit" className="gradient-brand w-full text-white">
          <Send className="h-4 w-4" /> Submit leave request
        </Button>
      </form>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Demo leave requests</h3>
        {demo.leaves.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Koi request nahi.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {demo.leaves.map((l) => (
              <li key={l.id} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {l.employeeName} · {l.type}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    pending
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {l.days} day(s) · {l.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReceiptsPanel({ demo, consume }: { demo: DemoState; consume: ConsumeFn }) {
  async function downloadPayslip(slip: DemoState["payslips"][number]) {
    try {
      const { PDFDocument, StandardFonts } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595, 842]); // A4
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const money = (n: number) => `PKR ${n.toLocaleString()}`;
      page.drawText("HCM Lite — Demo Payslip Receipt", { x: 50, y: 780, size: 18, font: bold });
      page.drawText(`(Demo Mode — not a production document)`, { x: 50, y: 760, size: 9, font });
      page.drawText(`Employee: ${slip.employeeName}`, { x: 50, y: 700, size: 12, font });
      page.drawText(`Month: ${slip.month}`, { x: 50, y: 680, size: 12, font });
      const rows: [string, string][] = [
        ["Gross salary (basic + 40% house rent + 10% medical)", money(slip.gross)],
        ["Total deductions (demo tax slab)", `- ${money(slip.deductions)}`],
        ["Net pay", money(slip.net)],
      ];
      let y = 640;
      for (const [k, v] of rows) {
        page.drawText(k, { x: 50, y, size: 11, font });
        page.drawText(v, { x: 380, y, size: 11, font: bold });
        y -= 24;
      }
      page.drawText("Contact: Muhammad Muneeb · WhatsApp +92-3140263346 · US Desk +1 (775) 312-8079", { x: 50, y: 120, size: 9, font });
      page.drawText(OWNER_EMAIL, { x: 50, y: 106, size: 9, font });
      const bytes = await pdf.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Demo_Payslip_${slip.employeeName.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF receipt downloaded.");
    } catch {
      toast.error("PDF generation failed — try again.");
    }
  }

  function runPayroll() {
    if (demo.employees.length === 0) {
      toast.error("Pehle Employees tab se ek employee add karein");
      return;
    }
    const employee = demo.employees[demo.payslips.length % demo.employees.length]!;
    if (!consume("receipts", (s) => ({
      ...s,
      payslips: [
        ...s.payslips,
        (() => {
          const gross = Math.round(employee.salary * 1.5);
          const deductions = Math.round(gross * 0.05);
          return { id: uid(), employeeName: employee.name, month: monthLabel(), gross, deductions, net: gross - deductions };
        })(),
      ],
    }))) return;
    toast.success("Payroll run complete — payslip receipt ready.");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-primary" /> Payroll Run ({demo.quotas.receipts}/{DEMO_QUOTA_LIMIT})
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Gross = basic + 40% house rent + 10% medical. Demo tax slab: 5%. Har run ek PDF receipt generate karta hai.
        </p>
        <Button className="gradient-brand mt-3 text-white" onClick={runPayroll}>
          ⚡ Run Payroll &amp; Generate Receipt
        </Button>
      </div>
      {demo.payslips.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Demo payslip receipts</h3>
          <ul className="mt-3 space-y-2">
            {demo.payslips.map((slip) => (
              <li key={slip.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{slip.employeeName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{slip.month}</span>
                </span>
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">Net: PKR {slip.net.toLocaleString()}</span>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => downloadPayslip(slip)}>
                    <Download className="h-3 w-3" /> PDF
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AiPanel({ demo, consume }: { demo: DemoState; consume: ConsumeFn }) {
  const [text, setText] = useState("");
  const [thread, setThread] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = text.trim();
    if (!question) return;
    const canned = AI_CANNED[thread.filter((m) => m.role === "assistant").length % AI_CANNED.length]!;
    const answer = canned.a.replace("{n}", String(demo.employees.length));
    if (!consume("ai", (s) => s)) return;
    setThread((t) => [...t, { role: "user", content: question }, { role: "assistant", content: answer }]);
    setText("");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Bot className="h-4 w-4 text-primary" /> AI Assistant — Roman Urdu &amp; English ({demo.quotas.ai}/{DEMO_QUOTA_LIMIT})
        <Badge variant="secondary" className="text-[10px]">
          AI-generated
        </Badge>
      </h3>
      <div className="mt-3 min-h-40 space-y-2">
        {thread.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Demo assistant se kuch bhi poochein — e.g. “Mujhe Monday aur Tuesday chutti chahiye”.
          </p>
        )}
        {thread.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <span
              className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-left text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={ask} className="mt-3 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything… (English / Roman Urdu)" />
        <Button type="submit" size="icon" aria-label="Send" className="gradient-brand text-white">
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Building2 className="h-3 w-3" /> Full version mein ye assistant real database tools chalata hai — role-scoped, har call audit-logged.
      </p>
    </div>
  );
}

export function useDemoQuotaSummary(): string | null {
  const demo = useMemo(() => loadDemoState(), []);
  return demo ? (Object.keys(DEMO_QUOTA_LABELS) as DemoQuotaKey[]).map((k) => `${DEMO_QUOTA_LABELS[k]} ${demo.quotas[k]}/${DEMO_QUOTA_LIMIT}`).join(" · ") : null;
}
