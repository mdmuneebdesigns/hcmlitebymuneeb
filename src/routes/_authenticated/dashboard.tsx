import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarCheck2, ChevronRight, Loader2, LogOut, RefreshCcw, ShieldCheck, UserCircle2 } from "lucide-react";
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
import { getMe, type Me } from "@/lib/auth.functions";
import { wipeAllData } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
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
    const result = await wipeAllData();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Database wiped — returning to first-run setup");
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/setup", replace: true });
  }

  const isEmployee = !me.roles.includes("admin") && !me.roles.includes("hr");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-4 w-4" />
            </div>
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
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <CalendarCheck2 className="h-4 w-4" /> Attendance, leave, payroll and analytics arrive in the coming build phases.
              </p>
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
              <AlertDialog>
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
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleWipe}>Yes, wipe database</AlertDialogAction>
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
