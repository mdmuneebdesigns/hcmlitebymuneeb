import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Building2, Loader2, LogOut, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import { getMe, type Me } from "@/lib/auth.functions";
import {
  applyLeave,
  cancelLeave,
  decideLeave,
  getMyLeaveBalances,
  listLeaveInbox,
  listMyLeaves,
  type LeaveBalance,
  type LeaveRow,
} from "@/lib/leave.functions";
import { parseLeaveText, type ParsedLeave } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/leaves")({
  loader: () => getMe(),
  component: LeavesPage,
  head: () => ({
    meta: [
      { title: "Leave Management — HCM Lite" },
      { name: "description", content: "Apply for leave, track balances and approve team leave requests." },
    ],
  }),
});

function LeavesPage() {
  const me = Route.useLoaderData() as Me;
  const router = useRouter();
  const listFn = useServerFn(listMyLeaves);
  const inboxFn = useServerFn(listLeaveInbox);
  const isPrivileged = me.roles.includes("admin") || me.roles.includes("hr");

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [myLeaves, setMyLeaves] = useState<LeaveRow[]>([]);
  const [inbox, setInbox] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [leaveTypeId, setLeaveTypeId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [nlText, setNlText] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [decisionFor, setDecisionFor] = useState<string | null>(null);
  const [decisionComment, setDecisionComment] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const bal = await getMyLeaveBalances();
        setBalances(bal.balances);
        if (bal.balances[0]) setLeaveTypeId(bal.balances[0].leaveTypeId);
        setMyLeaves(await listFn());
        if (isPrivileged) setInbox(await inboxFn());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load leave data");
      } finally {
        setLoading(false);
      }
    })();
  }, [listFn, inboxFn, isPrivileged]);

  async function prefill() {
    if (nlText.trim().length < 5) return toast.error("Type your leave request first");
    setNlBusy(true);
    try {
      const res = await parseLeaveText({ data: { text: nlText } });
      const p: ParsedLeave | null = res.parsed;
      if (!p) {
        toast.error("Could not understand that — please fill the form manually");
        return;
      }
      const matched = balances.find((b) => p.leaveType && b.name.toLowerCase().includes(p.leaveType.toLowerCase()));
      if (matched) setLeaveTypeId(matched.leaveTypeId);
      if (p.startDate) setStartDate(p.startDate);
      if (p.endDate) setEndDate(p.endDate);
      if (p.reason) setReason(p.reason);
      toast.success(
        `Pre-filled${matched ? ` ${matched.name}` : ""}${p.startDate ? ` from ${p.startDate}` : ""}${p.endDate ? ` to ${p.endDate}` : ""} — please review and submit.`,
      );
    } catch {
      toast.error("AI pre-fill failed — please fill the form manually");
    } finally {
      setNlBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!leaveTypeId || !startDate || !endDate) return toast.error("Select leave type and dates");
    setSubmitting(true);
    try {
      const res = await applyLeave({ data: { leaveTypeId, startDate, endDate, reason } });
      if (!res.ok) {
        toast.error(`${res.code === 422 ? "Not allowed" : "Error"}: ${res.error}`);
        return;
      }
      toast.success(`Leave request submitted (${res.workingDays} working day${res.workingDays === 1 ? "" : "s"})`);
      setStartDate("");
      setEndDate("");
      setReason("");
      setNlText("");
      const bal = await getMyLeaveBalances();
      setBalances(bal.balances);
      setMyLeaves(await listFn());
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    const res = await cancelLeave({ data: { id } });
    if (!res.ok) return toast.error(res.error);
    toast.success("Request cancelled");
    setMyLeaves(await listFn());
    const bal = await getMyLeaveBalances();
    setBalances(bal.balances);
  }

  async function decide(id: string, d: "approved" | "rejected") {
    const res = await decideLeave({ data: { id, decision: d, comment: decisionComment } });
    setDecisionFor(null);
    setDecisionComment("");
    if (!res.ok) return toast.error(res.error);
    toast.success(`Request ${d}`);
    setInbox(await inboxFn());
    router.invalidate();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const pendingInbox = inbox.filter((r) => r.status === "pending");
  const decidedInbox = inbox.filter((r) => r.status !== "pending");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarDays className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-foreground">Leave Management</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOutIcon className="h-4 w-4" /> Sign out
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {balances.map((b) => (
                <Card key={b.leaveTypeId}>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center justify-between">
                      {b.name}
                      {!b.isPaid && <Badge variant="secondary">Unpaid</Badge>}
                    </CardDescription>
                    <CardTitle className="text-2xl">{b.remaining === null ? "∞" : b.remaining}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {b.quota === null ? "Unlimited quota" : `${b.used} used · ${b.pending} pending of ${b.quota}/year`}
                  </CardContent>
                </Card>
              ))}
              {balances.length === 0 && (
                <Card className="sm:col-span-2 lg:col-span-4">
                  <CardContent className="text-sm text-muted-foreground">
                    No leave types configured yet — an Admin can set them up in Organization setup.
                  </CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Apply for leave</CardTitle>
                <CardDescription>
                  Working days only — weekends and public holidays are skipped automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Smart pre-fill (English / Roman Urdu)</label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      value={nlText}
                      onChange={(e) => setNlText(e.target.value)}
                      placeholder='e.g. "Need next Monday and Tuesday off for my sister\'s wedding" ya "Mujhe agle Monday chutti chahiye"'
                    />
                    <Button type="button" variant="secondary" onClick={prefill} disabled={nlBusy}>
                      {nlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Pre-fill
                    </Button>
                  </div>
                </div>
                <form className="grid gap-4 sm:grid-cols-3" onSubmit={submit}>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Leave type</label>
                    <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {balances.map((b) => (
                          <SelectItem key={b.leaveTypeId} value={b.leaveTypeId}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Start date</label>
                    <Input type="date" className="mt-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">End date</label>
                    <Input type="date" className="mt-1" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-xs font-medium text-muted-foreground">Reason</label>
                    <Textarea className="mt-1" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for leave" />
                  </div>
                  <div className="sm:col-span-3">
                    <Button type="submit" disabled={submitting || balances.length === 0}>
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit request
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>My leave requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {myLeaves.length === 0 && <p className="text-sm text-muted-foreground">No leave requests yet.</p>}
                {myLeaves.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {r.type_name} · {r.start_date} → {r.end_date} · {r.working_days} day{r.working_days === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                      {r.decision_comment && <p className="text-xs text-muted-foreground">Comment: {r.decision_comment}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {r.status === "pending" && (
                        <Button variant="ghost" size="icon" onClick={() => cancel(r.id)} aria-label="Cancel request">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {isPrivileged && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Approval inbox ({pendingInbox.length})</CardTitle>
                    <CardDescription>Pending leave requests from the whole team</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pendingInbox.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
                    {pendingInbox.map((r) => (
                      <div key={r.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {r.employee_name} ({r.employee_code}) · {r.type_name} · {r.start_date} → {r.end_date} · {r.working_days}d
                            </p>
                            <p className="text-xs text-muted-foreground">{r.reason}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => decide(r.id, "approved")}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => setDecisionFor(decisionFor === r.id ? null : r.id)}>
                              Reject…
                            </Button>
                          </div>
                        </div>
                        {decisionFor === r.id && (
                          <div className="mt-2 flex gap-2">
                            <Input value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} placeholder="Optional comment" />
                            <Button size="sm" variant="destructive" onClick={() => decide(r.id, "rejected")}>
                              Confirm reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Decided requests</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {decidedInbox.length === 0 && <p className="text-sm text-muted-foreground">No decisions yet.</p>}
                    {decidedInbox.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {r.employee_name} · {r.type_name} · {r.start_date} → {r.end_date}
                          </p>
                          {r.decision_comment && <p className="text-xs text-muted-foreground">Comment: {r.decision_comment}</p>}
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              <Building2 className="mr-1 inline h-3 w-3" />
              All decisions are logged to the audit trail. Employees are notified automatically.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
