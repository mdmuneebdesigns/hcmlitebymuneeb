import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarCheck,
  Clock,
  Loader2,
  Sparkles,
  TrendingDown,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getMe, type Me } from "@/lib/auth.functions";
import { getMyDashboard, getOrgDashboard, type DashboardData } from "@/lib/dashboard.functions";
import { summarizeKpis } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/dashboards")({
  loader: () => getMe(),
  component: DashboardsPage,
  head: () => ({
    meta: [
      { title: "Dashboards — HCM Lite" },
      { name: "description", content: "Role-scoped HR analytics: attendance, attrition risk, anomalies and payroll cost." },
    ],
  }),
});

const PIE_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#64748b"];

function DashboardsPage() {
  const me = Route.useLoaderData() as Me;
  const router = useRouter();
  const isPrivileged = me.roles.includes("admin") || me.roles.includes("hr");

  const orgFn = useServerFn(getOrgDashboard);
  const myFn = useServerFn(getMyDashboard);
  const summarizeFn = useServerFn(summarizeKpis);

  const [data, setData] = useState<DashboardData | null>(null);
  const [myData, setMyData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [department, setDepartment] = useState("all");
  const [bullets, setBullets] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        if (isPrivileged) {
          const res = await orgFn({ data: { from: from || undefined, to: to || undefined, departmentId: department === "all" ? undefined : department } });
          setData(res);
        } else {
          setMyData(await myFn());
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [orgFn, myFn, isPrivileged, from, to, department]);

  async function refetch() {
    setLoading(true);
    try {
      if (isPrivileged) {
        setData(
          await orgFn({ data: { from: from || undefined, to: to || undefined, departmentId: department === "all" ? undefined : department } }),
        );
      } else {
        setMyData(await myFn());
      }
    } finally {
      setLoading(false);
    }
  }

  async function summarize() {
    if (!data) return;
    setBusy(true);
    try {
      const res = await summarizeFn({ data: { kpis: data.kpis } });
      setBullets(res.bullets);
    } finally {
      setBusy(false);
    }
  }

  const kpiCards = data
    ? [
        { label: "Headcount", value: data.kpis?.headcount ?? 0, icon: Users, hint: `${data.kpis?.newJoiners ?? 0} joined · ${data.kpis?.exits ?? 0} exited` },
        { label: "Attendance", value: `${data.kpis?.attendanceRate ?? 0}%`, icon: CalendarCheck, hint: `${data.kpis?.presentDays ?? 0} present of ${data.kpis?.expectedDays ?? 0} expected days` },
        { label: "Late rate", value: `${data.kpis?.lateRate ?? 0}%`, icon: Clock, hint: "Arrivals after start + grace" },
        { label: "Absenteeism", value: `${data.kpis?.absenteeismRate ?? 0}%`, icon: TrendingDown, hint: "Days missed vs expected" },
        { label: "Leave utilization", value: `${data.kpis?.leaveUtilization ?? 0}%`, icon: BarChart3, hint: "Approved leave vs total quota" },
        { label: "Payroll cost", value: data.kpis?.payrollCostNet ? `PKR ${data.kpis.payrollCostNet.toLocaleString()}` : "—", icon: Building2, hint: data.kpis?.payrollPeriod ? `Latest run: ${data.kpis.payrollPeriod} (net)` : "No payroll run yet" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BarChart3 className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-foreground">{isPrivileged ? "Organization dashboard" : "My dashboard"}</span>
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
            {isPrivileged && data ? (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">From</label>
                    <Input type="date" className="mt-1 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">To</label>
                    <Input type="date" className="mt-1 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Department</label>
                    <Select value={department} onValueChange={(v) => { setDepartment(v); }}>
                      <SelectTrigger className="mt-1 w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All departments</SelectItem>
                        {data.departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={refetch} variant="secondary">
                    Apply filters
                  </Button>
                  <Button onClick={summarize} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Summarize with AI
                  </Button>
                </div>

                {bullets.length > 0 && (
                  <Card className="border-primary/40">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Sparkles className="h-4 w-4 text-primary" /> AI insights
                        <Badge variant="secondary" className="text-[10px]">AI-generated</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                        {bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {kpiCards.map((c) => (
                    <Card key={c.label}>
                      <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                          <c.icon className="h-3.5 w-3.5" /> {c.label}
                        </CardDescription>
                        <CardTitle className="text-2xl">{c.value}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-xs text-muted-foreground">{c.hint}</CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Weekly attendance trend</CardTitle>
                      <CardDescription>Attendance rate per week (%)</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                          <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="present" stackId="a" fill="#22c55e" name="Present" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="late" stackId="a" fill="#f59e0b" name="Late" />
                          <Bar dataKey="onLeave" stackId="a" fill="#0ea5e9" name="On leave" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Headcount by department</CardTitle>
                      <CardDescription>Employees in each department</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data.departments} dataKey="headcount" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                            {data.departments.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Attendance rate by department (%)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.departments}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                          <Bar dataKey="attendanceRate" fill="#0ea5e9" radius={4} name="Attendance %" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <TrendingDown className="h-4 w-4" /> Attrition risk flags
                      </CardTitle>
                      <CardDescription>Scores are 0–100; high scores need a check-in conversation</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data.attrition.length === 0 && <p className="text-sm text-muted-foreground">No flagged employees in this period.</p>}
                      {data.attrition.map((a) => (
                        <div key={a.employeeId} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{a.name}</p>
                            <p className="text-xs text-muted-foreground">{a.reasons.join(" · ")}</p>
                          </div>
                          <Badge variant={a.score >= 60 ? "destructive" : "secondary"}>{a.score}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="h-4 w-4" /> Anomaly alerts
                      </CardTitle>
                      <CardDescription>Detected from attendance, leave and attrition signals</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data.anomalies.length === 0 && <p className="text-sm text-muted-foreground">No anomalies detected. 🎉</p>}
                      {data.anomalies.map((a, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                          <p className="text-sm text-foreground">{a.message}</p>
                          <Badge variant={a.severity === "high" ? "destructive" : "secondary"}>{a.severity}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              myData && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { label: "Present days", value: myData.my?.presentDays ?? 0, hint: `last 30 days (half days count 0.5)` },
                      { label: "Late arrivals", value: myData.my?.lateDays ?? 0, hint: "after start + grace" },
                      { label: "Missed days", value: myData.my?.absentDays ?? 0, hint: "expected minus present" },
                      { label: "Leave utilization", value: myData.my?.leaveBalanceSummary ?? "—", hint: "this calendar year" },
                    ].map((c) => (
                      <Card key={c.label}>
                        <CardHeader className="pb-2">
                          <CardDescription>{c.label}</CardDescription>
                          <CardTitle className="text-2xl">{c.value}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs text-muted-foreground">{c.hint}</CardContent>
                      </Card>
                    ))}
                  </div>
                  <Card>
                    <CardContent className="text-sm text-muted-foreground">
                      Tip: use the AI assistant (bottom-right) to check your leave balance or company policy any time.
                    </CardContent>
                  </Card>
                </>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
