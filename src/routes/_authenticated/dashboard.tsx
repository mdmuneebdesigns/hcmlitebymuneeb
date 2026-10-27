import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarCheck2, ChevronRight, FileText, Loader2, LogOut, RefreshCcw, ShieldCheck, UserCircle2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";
import { getMe, type Me } from "@/lib/auth.functions";
import { wipeAllData } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — HCM Lite" },
      { name: "description", content: "Your personal HR workspace: camera check-in, leave balances and company announcements." },
    ],
  }),
  staticData: { sitemap: false },
  loader: () => getMe(),
  component: DashboardPage,
});

function roleLabel(roles: string[]): string {
  if (roles.includes("admin")) return "Admin";
  if (roles.includes("hr")) return "HR";
  if (roles.includes("employee")) return "Employee";
  return "Unknown";
}

function DashboardPage() {
  const me = Route.useLoaderData() as Me;
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState<string | null>(null);
  // The wipe confirmation requires the Admin to type RESET exactly.
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    supabase
      .from("companies")
      .select("name")
      .limit(1)
      .then(({ data }) => setCompanyName(data?.[0]?.name ?? null));
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  async function handleWipe() {
    setWiping(true);
    const result = await wipeAllData();
    if (!result.ok) {
      toast.error(result.error);
      setWiping(false);
      return;
    }
    // The signing account no longer exists; clear state and hard-reload into
    // the public setup route so no stale session redirect can win the race.
    await queryClient.cancelQueries();
    queryClient.clear();
    supabase.auth.signOut().catch(() => undefined);
    window.location.replace("/setup");
  }

  const isEmployee = !me.roles.includes("admin") && !me.roles.includes("hr");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <BrandLogo size={32} />
            <div>
              <span className="text-sm font-semibold text-foreground">HCM Lite</span>
              {companyName ? <span className="ml-2 text-xs text-muted-foreground">{companyName}</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1">
              {me.roles.includes("admin") ? <ShieldCheck className="h-3 w-3" /> : <UserCircle2 className="h-3 w-3" />}
              {roleLabel(me.roles)}
            </Badge>
            <Link to="/project-blueprint" className="hidden items-center gap-1.5 text-sm text-foreground hover:underline sm:flex">
              <FileText className="h-4 w-4" /> Project Blueprint PDF
            </Link>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {me.mustChangePassword && (
          <Card className="border-destructive">
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-foreground">You are using a temporary password</p>
                  <p className="text-sm text-muted-foreground">Change it before using the app.</p>
                </div>
              </div>
              <Button size="sm" variant="destructive" onClick={() => navigate({ to: "/change-password" })}>
                Change password <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome{me.fullName ? `, ${me.fullName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {roleLabel(me.roles)} dashboard · {me.email}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Your access</CardDescription>
              <CardTitle className="text-lg">{roleLabel(me.roles)} workspace</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {isEmployee
                ? "Check in/out, apply for leave, and view your own records and payslips."
                : "Manage the organization, employees, attendance, leave and payroll."}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Data status</CardDescription>
              <CardTitle className="text-lg">Fresh install</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              No demo data is loaded. Every number on this dashboard will come from real activity recorded in the app.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Next up</CardDescription>
              <CardTitle className="text-lg">Modules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {me.roles.includes("admin") && (
                <Link to="/org" className="flex items-center gap-2 text-foreground hover:underline">
                  <Building2 className="h-4 w-4" /> Organization setup
                </Link>
              )}
              {(me.roles.includes("admin") || me.roles.includes("hr")) && (
                <Link to="/employees" className="flex items-center gap-2 text-foreground hover:underline">
                  <UserCircle2 className="h-4 w-4" /> Employee directory
                </Link>
              )}
              <Link to="/attendance" className="flex items-center gap-2 text-foreground hover:underline">
                <CalendarCheck2 className="h-4 w-4" /> Attendance — check in / out
              </Link>
              {me.employeeId && (
                <Link to="/employees/$id" params={{ id: me.employeeId }} className="flex items-center gap-2 text-foreground hover:underline">
                  <UserCircle2 className="h-4 w-4" /> My profile
                </Link>
              )}
            </CardContent>

          </Card>
        </div>

        {me.roles.includes("admin") && (
          <Card className="border-destructive/40">
            <CardHeader className="pb-2">
              <CardDescription>Judge utilities</CardDescription>
              <CardTitle className="text-lg">Reset to fresh install</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Wipes every record and account and restarts the first-run wizard. Use before judging.
              </p>
              <AlertDialog onOpenChange={(open) => !open && setWipeConfirm("")}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <RefreshCcw className="h-4 w-4" /> Wipe database
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset everything?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the company, all employees, attendance, leave, payroll and accounts. You will be returned to the first-run setup wizard.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="wipe-confirm">
                      Type <span className="font-mono font-bold">RESET</span> to confirm
                    </Label>
                    <Input
                      id="wipe-confirm"
                      value={wipeConfirm}
                      onChange={(e) => setWipeConfirm(e.target.value)}
                      placeholder="RESET"
                      autoComplete="off"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleWipe}
                      disabled={wipeConfirm !== "RESET" || wiping}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {wiping ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Yes, wipe database
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
