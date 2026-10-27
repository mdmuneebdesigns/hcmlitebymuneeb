import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMe } from "@/lib/auth.functions";
import { getFirstRunStatus, provisionFirstAdmin } from "@/lib/setup.functions";
import { PasswordStrengthChecklist, isPasswordStrong } from "@/components/password-checklist";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = typeof search["redirect"] === "string" ? search["redirect"] : undefined;
    return redirect ? { redirect } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — HCM Lite" },
      { name: "description", content: "Sign in or create your account to start setting up HCM Lite." },
      { property: "og:title", content: "Sign in — HCM Lite" },
      { property: "og:description", content: "Sign in or create your account to start setting up HCM Lite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@saylani.test", password: "Admin@HCM2026" },
  { label: "HR", email: "hr@saylani.test", password: "Hr@HCM2026" },
  { label: "Employee", email: "bilal@saylani.test", password: "Emp@HCM2026" },
];

/** Only same-origin, root-relative paths are safe to redirect to. */
function safeRedirect(target: string | undefined): string | null {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return null;
  return target;
}

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const redirectTarget = safeRedirect(Route.useSearch().redirect);

  const [freshInstall, setFreshInstall] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getFirstRunStatus()
      .then((s) => setFreshInstall(!s.companyExists))
      .catch(() => setFreshInstall(false));
  }, []);

  // Already signed in? Go straight to the intended destination.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ href: redirectTarget ?? "/dashboard", replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signedInDestination(mustChangePassword: boolean): string {
    if (redirectTarget) return redirectTarget;
    return mustChangePassword ? "/change-password" : "/dashboard";
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      toast.error(signInError.message === "Invalid login credentials" ? "Invalid email or password" : signInError.message);
      setLoading(false);
      return;
    }
    try {
      const me = await getMe();
      navigate({ href: signedInDestination(me.mustChangePassword), replace: true });
    } catch {
      toast.error("Signed in, but your profile could not be loaded");
      setLoading(false);
    }
  }

  /**
   * Sign-up is offered only on a fresh install (no company yet) — after
   * setup completes, accounts are created by the Admin/HR only. The server
   * provisions a confirmed account (fresh-install guard inside), then we
   * sign straight in and route to /setup.
   */
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!isPasswordStrong(password)) {
      toast.error("Password must meet all 5 requirements below");
      return;
    }
    setLoading(true);
    const provisioned = await provisionFirstAdmin({
      data: { adminFullName: fullName.trim(), adminEmail: email.trim(), adminPassword: password },
    });
    if (!provisioned.ok) {
      toast.error(provisioned.error);
      setLoading(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      toast.success("Account created — please sign in");
      setLoading(false);
      return;
    }
    toast.success("Account created — let's set up your company");
    navigate({ to: "/setup", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <BrandLogo size={48} />
          </div>
          <CardTitle className="text-xl font-bold">
            {redirectTarget === "/setup" ? "Sign in to start your setup" : "Sign in to HCM Lite"}
          </CardTitle>
          <CardDescription>
            {redirectTarget === "/setup"
              ? "Create your account or sign in — then configure your company and geofence"
              : "Use the account created for you by your company"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {freshInstall === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue={freshInstall ? "signup" : "signin"}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                {freshInstall && <TabsTrigger value="signup">Sign Up</TabsTrigger>}
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                    Sign in
                  </Button>
                </form>
                <div className="mt-4 rounded-lg border border-dashed border-border p-3 text-xs">
                  <p className="font-medium text-foreground">Quick Demo Credentials</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Click a row to fill the form (accounts must exist — recreate them after a Judge Reset).
                  </p>
                  <div className="mt-2 space-y-1">
                    {DEMO_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => {
                          setEmail(acc.email);
                          setPassword(acc.password);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-accent"
                      >
                        <span className="font-medium text-foreground">{acc.label}</span>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {acc.email} · {acc.password}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  {freshInstall
                    ? "This workspace has no company yet — you can sign up and become its Admin."
                    : "Accounts are created by your Admin or HR — there is no self-signup."}
                </p>
              </TabsContent>

              {freshInstall && (
                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full name</Label>
                      <Input
                        id="signup-name"
                        type="text"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ayesha Khan"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      <PasswordStrengthChecklist password={password} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading || !isPasswordStrong(password)}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Create account &amp; continue to setup
                    </Button>
                  </form>
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    Sign-up is available only until the first company is created — afterwards your Admin or HR
                    creates accounts.
                  </p>
                </TabsContent>
              )}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
