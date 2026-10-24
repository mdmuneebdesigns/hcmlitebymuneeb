import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Banknote, Building2, Download, Loader2, Lock, Play, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import { getMe, type Me } from "@/lib/auth.functions";
import {
  finalizePayroll,
  getPayslipPdf,
  getPayrollRun,
  listMyPayslips,
  listPayrollRuns,
  runPayrollDraft,
  type PayrollRunDto,
  type PayslipDto,
} from "@/lib/payroll.functions";

export const Route = createFileRoute("/_authenticated/payroll")({
  loader: () => getMe(),
  component: PayrollPage,
  head: () => ({
    meta: [
      { title: "Payroll — HCM Lite" },
      { name: "description", content: "Run monthly payroll, finalize runs and download payslip PDFs." },
    ],
  }),
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function PayrollPage() {
  const me = Route.useLoaderData() as Me;
  const router = useRouter();
  const mySlipsFn = useServerFn(listMyPayslips);
  const runsFn = useServerFn(listPayrollRuns);
  const runDetailFn = useServerFn(getPayrollRun);
  const draftFn = useServerFn(runPayrollDraft);
  const finalizeFn = useServerFn(finalizePayroll);
  const pdfFn = useServerFn(getPayslipPdf);

  const isPrivileged = me.roles.includes("admin") || me.roles.includes("hr");
  const isAdmin = me.roles.includes("admin");

  const [mySlips, setMySlips] = useState<(PayslipDto & { period_year: number; period_month: number; run_status: string })[]>([]);
  const [runs, setRuns] = useState<PayrollRunDto[]>([]);
  const [selectedRun, setSelectedRun] = useState<{ run: PayrollRunDto; payslips: PayslipDto[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const now = new Date();
  const [month, setMonth] = useState(String(now.getFullYear() === 2026 ? now.getMonth() + 1 : 10));
  const [year, setYear] = useState(String(now.getFullYear()));

  useEffect(() => {
    (async () => {
      try {
        setMySlips(await mySlipsFn());
        if (isPrivileged) {
          const r = await runsFn();
          setRuns(r);
          if (r[0]) setSelectedRun(await runDetailFn({ data: { runId: r[0].id } }));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load payroll data");
      } finally {
        setLoading(false);
      }
    })();
  }, [mySlipsFn, runsFn, runDetailFn, isPrivileged]);

  async function refreshRuns() {
    const r = await runsFn();
    setRuns(r);
    if (r[0]) setSelectedRun(await runDetailFn({ data: { runId: r[0].id } }));
    setMySlips(await mySlipsFn());
    router.invalidate();
  }

  async function runDraft() {
    setBusy(true);
    try {
      const res = await draftFn({ data: { year: Number(year), month: Number(month) } });
      if (!res.ok) return toast.error(res.error);
      toast.success(`Draft payroll created — ${res.employees} payslip(s), net total PKR ${res.totalNet.toLocaleString()}`);
      await refreshRuns();
    } finally {
      setBusy(false);
    }
  }

  async function finalize(runId: string) {
    setBusy(true);
    try {
      const res = await finalizeFn({ data: { runId } });
      if (!res.ok) return toast.error(res.error);
      toast.success("Payroll finalized and locked. Employees have been notified.");
      await refreshRuns();
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(runId: string, employeeId?: string) {
    try {
      const res = await pdfFn({ data: { runId, employeeId } });
      if (!res.ok) return toast.error(res.error);
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Payslip PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate the PDF");
    }
  }

  const fmt = (n: number) => `PKR ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-foreground">Payroll</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut().then(() => router.navigate({ to: "/auth", replace: true }))}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {isPrivileged && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Run payroll</CardTitle>
                    <CardDescription>
                      Draft a monthly run: gross = 1.5 × basic, per-day = gross ÷ working days, deductions for absent / unpaid /
                      half-days, late penalty, annualized progressive tax, proration for joiners & leavers.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Month</label>
                      <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger className="mt-1 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m, i) => (
                            <SelectItem key={m} value={String(i + 1)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Year</label>
                      <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="mt-1 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={runDraft} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run draft payroll
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payroll runs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {runs.length === 0 && <p className="text-sm text-muted-foreground">No payroll runs yet.</p>}
                    {runs.map((r) => (
                      <div
                        key={r.id}
                        className={
                          "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 " +
                          (selectedRun?.run.id === r.id ? "border-primary" : "")
                        }
                      >
                        <button className="text-left" onClick={() => runDetailFn({ data: { runId: r.id } }).then(setSelectedRun)}>
                          <p className="text-sm font-medium text-foreground">
                            {MONTHS[r.period_month - 1]} {r.period_year} · {r.working_days} working days
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Gross {fmt(r.total_gross)} · Net {fmt(r.total_net)}
                          </p>
                        </button>
                        <div className="flex items-center gap-2">
                          <Badge variant={r.status === "finalized" ? "default" : "secondary"} className="gap-1">
                            {r.status === "finalized" && <Lock className="h-3 w-3" />}
                            {r.status}
                          </Badge>
                          {r.status !== "finalized" && isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="destructive">
                                  <Lock className="h-3 w-3" /> Finalize
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Finalize payroll?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This locks {MONTHS[r.period_month - 1]} {r.period_year} permanently — no re-run is possible and every
                                    employee is notified. Draft runs can still be regenerated before finalizing.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => finalize(r.id)}>Finalize & lock</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {selectedRun && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {MONTHS[selectedRun.run.period_month - 1]} {selectedRun.run.period_year} payslips ({selectedRun.payslips.length})
                      </CardTitle>
                      <CardDescription>
                        Net total {fmt(selectedRun.run.total_net)} ·{" "}
                        {selectedRun.run.status === "finalized" ? "Finalized (locked)" : "Draft — you can re-run"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground">
                            <th className="py-2">Employee</th>
                            <th className="py-2">Basic</th>
                            <th className="py-2">Gross</th>
                            <th className="py-2">Present</th>
                            <th className="py-2">Absent</th>
                            <th className="py-2">Lates</th>
                            <th className="py-2">Tax</th>
                            <th className="py-2">Net</th>
                            <th className="py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRun.payslips.map((s) => (
                            <tr key={s.id} className="border-t">
                              <td className="py-2">
                                <span className="font-medium text-foreground">{s.employee_name}</span>{" "}
                                <span className="text-xs text-muted-foreground">
                                  {s.employee_code} · {s.department_name ?? "—"}
                                </span>
                              </td>
                              <td className="py-2">{fmt(s.basic_salary)}</td>
                              <td className="py-2">{fmt(s.gross_salary)}</td>
                              <td className="py-2">{s.present_days}</td>
                              <td className="py-2">{s.absent_days}</td>
                              <td className="py-2">{s.lates}</td>
                              <td className="py-2">{fmt(s.tax)}</td>
                              <td className="py-2 font-semibold text-foreground">{fmt(s.net_pay)}</td>
                              <td className="py-2">
                                <Button variant="ghost" size="sm" onClick={() => downloadPdf(s.run_id, s.employee_id)}>
                                  <Download className="h-3 w-3" /> PDF
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {!isPrivileged && (
              <Card>
                <CardHeader>
                  <CardTitle>My payslips</CardTitle>
                  <CardDescription>Issued by HR after each payroll run. Download the PDF for your records.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {mySlips.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No payslips yet — they appear here after HR runs payroll for a month.
                    </p>
                  )}
                  {mySlips.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {MONTHS[s.period_month - 1]} {s.period_year}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Gross {fmt(s.gross_salary)} · Deductions {fmt(s.absence_deduction + s.late_deduction)} · Tax {fmt(s.tax)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={s.run_status === "finalized" ? "default" : "secondary"}>{s.run_status}</Badge>
                        <span className="text-sm font-semibold text-foreground">{fmt(s.net_pay)}</span>
                        <Button variant="ghost" size="sm" onClick={() => downloadPdf(s.run_id)}>
                          <Download className="h-3 w-3" /> PDF
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground">
              <Banknote className="mr-1 inline h-3 w-3" />
              <Building2 className="mr-1 inline h-3 w-3" />
              Every draft run and finalize action is written to the audit trail. Finalized runs are locked for everyone, including Admin.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
