import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  Copy,
  Database,
  Eraser,
  Inbox,
  KeyRound,
  Loader2,
  MessageCircle,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { BrandLogo } from "@/components/brand-logo";
import { pageMeta } from "@/lib/seo";
import { PLAN_LABELS, WHATSAPP_PK, WHATSAPP_US, formatDaysLeft, whatsappLink, type LicensePlan } from "@/lib/license";
import {
  superAdminApproveLead,
  superAdminBanCompany,
  superAdminGenerateLicense,
  superAdminLicenseAction,
  superAdminListAudit,
  superAdminListCompanies,
  superAdminListLeads,
  superAdminListLicenses,
  superAdminPing,
  type SuperAdminAuditRow,
  type SuperAdminCompany,
  type SuperAdminLead,
} from "@/lib/license.functions";
import type { LicenseRow } from "@/lib/license";

export const Route = createFileRoute("/super-admin")({
  ssr: false,
  staticData: { sitemap: false },
  head: () => ({
    meta: pageMeta({
      title: "Super Admin — License & Device Control Center | HCM Lite",
      description: "Platform owner console: generate licenses, monitor devices and companies, and manage sales leads.",
      path: "/super-admin",
      indexable: false,
    }),
  }),
  component: SuperAdminPage,
});

const PIN_STORAGE_KEY = "hcm-super-admin-pin";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SuperAdminPage() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [companies, setCompanies] = useState<SuperAdminCompany[]>([]);
  const [leads, setLeads] = useState<SuperAdminLead[]>([]);
  const [audit, setAudit] = useState<SuperAdminAuditRow[]>([]);
  const [busy, setBusy] = useState(false);

  // License generator form
  const [genPlan, setGenPlan] = useState<LicensePlan>("monthly_30d");
  const [genName, setGenName] = useState("");
  const [genEmail, setGenEmail] = useState("");
  const [genPhone, setGenPhone] = useState("");
  const [genCompany, setGenCompany] = useState("");
  const [lastGenerated, setLastGenerated] = useState<{ key: string; plan: LicensePlan } | null>(null);
  const [copied, setCopied] = useState(false);

  // Lead approval
  const [approvingLead, setApprovingLead] = useState<string | null>(null);
  const [approvedKey, setApprovedKey] = useState<{ leadId: string; key: string } | null>(null);
  const [banConfirm, setBanConfirm] = useState("");

  const refresh = useCallback(
    async (activePin: string) => {
      const [lic, comp, ld, au] = await Promise.all([
        superAdminListLicenses({ data: { pin: activePin } }),
        superAdminListCompanies({ data: { pin: activePin } }),
        superAdminListLeads({ data: { pin: activePin } }),
        superAdminListAudit({ data: { pin: activePin } }),
      ]);
      setLicenses(lic);
      setCompanies(comp);
      setLeads(ld);
      setAudit(au);
    },
    [],
  );

  // Restore the PIN from this tab's session storage and verify it.
  useEffect(() => {
    const saved = window.sessionStorage.getItem(PIN_STORAGE_KEY) ?? "";
    superAdminPing({ data: { pin: saved } })
      .then((res) => {
        if (res.ok) {
          setPin(saved);
          setAuthed(true);
          refresh(saved).catch(() => undefined);
        } else {
          setAuthed(false);
        }
      })
      .catch(() => setAuthed(false));
  }, [refresh]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await superAdminPing({ data: { pin } });
      if (!res.ok) {
        toast.error(res.error ?? "Owner access required");
        setAuthed(false);
        return;
      }
      window.sessionStorage.setItem(PIN_STORAGE_KEY, pin);
      setAuthed(true);
      toast.success("Owner console unlocked");
      await refresh(pin);
    } finally {
      setBusy(false);
    }
  }

  async function run<T>(fn: () => Promise<T>, successMessage?: string): Promise<T | null> {
    setBusy(true);
    try {
      const result = await fn();
      // Action fns return { ok: false, error } instead of throwing.
      const failed =
        typeof result === "object" && result !== null && "ok" in result && (result as { ok: boolean }).ok === false;
      if (failed) {
        const err = (result as { error?: string }).error ?? "Action failed";
        toast.error(err);
        return null;
      }
      if (successMessage) toast.success(successMessage);
      await refresh(pin);
      return result;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    const created = await run(
      () =>
        superAdminGenerateLicense({
          data: { pin, plan: genPlan, clientName: genName, clientEmail: genEmail, clientCompany: genCompany },
        }),
      "License key generated",
    );
    if (created) {
      setLastGenerated({ key: created.key, plan: created.plan });
      setGenName("");
      setGenEmail("");
      setGenCompany("");
    }
  }

  async function handleCopyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      toast.success("Key copied — paste it on WhatsApp");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed — select the key manually");
    }
  }

  async function handleApproveLead(leadId: string, plan: LicensePlan) {
    setApprovingLead(leadId);
    const result = await run(() => superAdminApproveLead({ data: { pin, leadId, plan } }));
    setApprovingLead(null);
    if (result?.ok) {
      setApprovedKey({ leadId, key: result.key });
    } else if (result && !result.ok) {
      toast.error(result.error ?? "Could not generate the key");
    }
  }

  async function handleBanCompany(companyId: string) {
    await run(() => superAdminBanCompany({ data: { pin, companyId } }), "Company banned — license revoked and sessions killed");
  }

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2">
              <BrandLogo size={48} />
            </div>
            <CardTitle className="flex items-center justify-center gap-2 text-xl font-bold">
              <ShieldCheck className="h-5 w-5 text-primary" /> Owner Control Center
            </CardTitle>
            <CardDescription>Enter the Owner Master PIN to manage licenses, devices and companies.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlock} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="ownerPin">Owner Master PIN</Label>
                <Input
                  id="ownerPin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="off"
                />
              </div>
              <Button type="submit" className="w-full gradient-brand text-white" disabled={busy || !pin.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />} Unlock console
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo size={40} />
            <div>
              <h1 className="text-xl font-bold text-foreground">Super Admin — License & Device Control</h1>
              <p className="text-xs text-muted-foreground">1-device hardware/browser locking · anti-piracy engine</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh(pin)} disabled={busy}>
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        <Tabs defaultValue="licenses">
          <TabsList>
            <TabsTrigger value="licenses" className="gap-1">
              <KeyRound className="h-4 w-4" /> Licenses ({licenses.length})
            </TabsTrigger>
            <TabsTrigger value="companies" className="gap-1">
              <Building2 className="h-4 w-4" /> Companies ({companies.length})
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-1">
              <Inbox className="h-4 w-4" /> Leads ({leads.length})
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1">
              <Database className="h-4 w-4" /> Activity
            </TabsTrigger>
          </TabsList>

          {/* ---------- Licenses ---------- */}
          <TabsContent value="licenses" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>🔑 License Generator</CardTitle>
                <CardDescription>Generate a 1-device-locked key and send it to the client on WhatsApp.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="genPlan">Plan</Label>
                    <select
                      id="genPlan"
                      value={genPlan}
                      onChange={(e) => setGenPlan(e.target.value as LicensePlan)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    >
                      <option value="monthly_30d">30-Day Monthly (1-Device Lock)</option>
                      <option value="lifetime">Lifetime Enterprise (1-Device Lock)</option>
                      <option value="trial">7-Day Trial</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="genName">Client name</Label>
                    <Input id="genName" value={genName} onChange={(e) => setGenName(e.target.value)} placeholder="Ahmed Raza" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="genEmail">Client email</Label>
                    <Input id="genEmail" type="email" value={genEmail} onChange={(e) => setGenEmail(e.target.value)} placeholder="client@company.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="genCompany">Company</Label>
                    <Input id="genCompany" value={genCompany} onChange={(e) => setGenCompany(e.target.value)} placeholder="Acme Pvt Ltd" />
                  </div>
                </div>
                <Button className="gradient-brand text-white" onClick={handleGenerate} disabled={busy || !genName.trim() || !genEmail.trim()}>
                  <KeyRound className="h-4 w-4" /> Generate license key
                </Button>
                {lastGenerated ? (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      New {PLAN_LABELS[lastGenerated.plan]} key — copy and send on WhatsApp:
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <code className="rounded bg-background px-2 py-1 font-mono text-sm font-bold text-foreground">{lastGenerated.key}</code>
                      <Button size="sm" variant="outline" onClick={() => void handleCopyKey(lastGenerated.key)}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy
                      </Button>
                      <Button size="sm" asChild variant="outline">
                        <a
                          href={whatsappLink(
                            WHATSAPP_PK,
                            `Assalam o Alaikum! Aapki HCM Lite license key: ${lastGenerated.key} (${PLAN_LABELS[lastGenerated.plan]}). Isay /setup par activate karein — 1 device lock applied.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="h-4 w-4" /> Send on WhatsApp
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-3">
              {licenses.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">No license keys yet — generate the first one above.</CardContent>
                </Card>
              ) : null}
              {licenses.map((lic) => (
                <Card key={lic.id}>
                  <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="font-mono text-sm font-bold text-foreground">{lic.license_key}</code>
                        <StatusBadge status={lic.status} />
                        <Badge variant="outline" className="text-xs">
                          {formatDaysLeft(lic.expires_at)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {lic.assigned_company_name ?? lic.assigned_email ?? "Unassigned"} · {lic.assigned_email ?? "no email"} ·{" "}
                        {lic.bound_device_info ? `${lic.bound_device_info} · Active ${timeAgo(lic.last_active_at)}` : "No device bound yet"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void handleCopyKey(lic.license_key)}>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void run(() => superAdminLicenseAction({ data: { pin, licenseId: lic.id, action: "reset_device" } }), "Device lock reset — key is claimable again")}
                      >
                        <Eraser className="h-3.5 w-3.5" /> Reset Device Lock
                      </Button>
                      {lic.plan_type !== "lifetime" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void run(() => superAdminLicenseAction({ data: { pin, licenseId: lic.id, action: "extend" } }), "Extended by 30 days")}
                        >
                          ⏳ Extend 30 Days
                        </Button>
                      ) : null}
                      {lic.status === "revoked" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void run(() => superAdminLicenseAction({ data: { pin, licenseId: lic.id, action: "activate" } }), "License reactivated")}
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void run(() => superAdminLicenseAction({ data: { pin, licenseId: lic.id, action: "revoke" } }), "License revoked")}
                        >
                          🚫 Revoke
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ---------- Companies ---------- */}
          <TabsContent value="companies" className="space-y-3">
            {companies.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">No companies registered yet.</CardContent>
              </Card>
            ) : null}
            {companies.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{c.name}</span>
                      {c.adminLastSignIn && Date.now() - new Date(c.adminLastSignIn).getTime() < 7 * 86_400_000 ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">🟢 Online / Active</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">⚪ Inactive</span>
                      )}
                      {c.licenseKey ? <Badge variant="outline" className="font-mono text-xs">{c.licenseKey}</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Admin: {c.adminEmail ?? "—"} · {c.employeeCount} employees · {c.boundDeviceInfo ? `Device: ${c.boundDeviceInfo}` : "No device bound"} ·
                      Last active: {timeAgo(c.lastActiveAt)}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" disabled={busy}>
                        <Trash2 className="h-3.5 w-3.5" /> 🗑️ Revoke Access & Delete Company
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Ban {c.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This revokes the company's license, deletes its entire workspace and kicks out every session. This
                          cannot be undone. Type <strong>DELETE</strong> to confirm.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Input value={banConfirm} onChange={(e) => setBanConfirm(e.target.value)} placeholder="Type DELETE" />
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setBanConfirm("")}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground"
                          disabled={banConfirm !== "DELETE"}
                          onClick={() => {
                            setBanConfirm("");
                            void handleBanCompany(c.id);
                          }}
                        >
                          Ban company
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ---------- Leads ---------- */}
          <TabsContent value="leads" className="space-y-3">
            {leads.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">No sales leads yet.</CardContent>
              </Card>
            ) : null}
            {leads.map((lead) => (
              <Card key={lead.id}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {lead.fullName} · {lead.companyName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lead.email} · {lead.phone} · {lead.teamSize ?? "—"} · {lead.inquiryType ?? "—"} · {timeAgo(lead.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{lead.message}</p>
                  {approvedKey?.leadId === lead.id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2">
                      <code className="font-mono text-sm font-bold text-foreground">{approvedKey.key}</code>
                      <Button size="sm" variant="outline" onClick={() => void handleCopyKey(approvedKey.key)}>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </Button>
                      <Button
                        size="sm"
                        asChild
                        variant="outline"
                      >
                        <a
                          href={whatsappLink(
                            lead.phone.replace(/[^0-9]/g, "") || WHATSAPP_PK,
                            `Congratulations ${lead.fullName}! Aapki HCM Lite license key: ${approvedKey.key}. Isay /setup par activate karein.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Reply on WhatsApp
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="gradient-brand text-white"
                        disabled={busy || approvingLead === lead.id || lead.status === "approved"}
                        onClick={() => void handleApproveLead(lead.id, "monthly_30d")}
                      >
                        {approvingLead === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Approve & Generate 30-Day Key
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || approvingLead === lead.id || lead.status === "approved"}
                        onClick={() => void handleApproveLead(lead.id, "lifetime")}
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Lifetime Key
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={whatsappLink(
                            lead.phone.replace(/[^0-9]/g, "") || WHATSAPP_US,
                            `Hello ${lead.fullName}, thank you for your interest in HCM Lite!`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Reply on WhatsApp
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ---------- Activity ---------- */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Platform activity</CardTitle>
                <CardDescription>Latest 60 privileged actions across the platform.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {audit.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No activity yet.</p> : null}
                {audit.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 border-b py-1.5 text-xs last:border-0">
                    <span className="font-mono text-foreground">{row.action}</span>
                    <span className="truncate text-muted-foreground">{row.actorEmail ?? "system"}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{timeAgo(row.createdAt)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
