import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Check, KeyRound, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeFirstRunSetup, getFirstRunStatus } from "@/lib/setup.functions";
import { validateLicenseKey } from "@/lib/license.functions";
import { MASTER_SETUP_KEY, PLAN_LABELS, type LicensePlan } from "@/lib/license";
import { getDeviceFingerprint, type DeviceIdentity } from "@/lib/device";
import { getMe, type Me } from "@/lib/auth.functions";
import { getRealUserLocation } from "@/lib/geo";
import { BrandLogo } from "@/components/brand-logo";
import { pageMeta } from "@/lib/seo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/setup")({
  ssr: false,
  // Setup is a secure, authenticated surface — visitors must sign in/up first.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { redirect: "/setup" }, replace: true });
    }
  },
  staticData: { sitemap: false },
  head: () => ({
    meta: pageMeta({
      title: "Workspace Setup Wizard — Configure Company & Geofence | HCM Lite",
      description: "Initialize your company rules, office hours and GPS geofence coordinates to launch your HCM Lite workspace.",
      path: "/setup",
      indexable: false,
    }),
  }),
  component: SetupPage,
});

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Zaitoon Ashraf IT Park, Karachi — the default office location so setup
// never blocks on GPS (preview iframes often block geolocation).
const DEFAULT_LAT = "24.8607";
const DEFAULT_LNG = "67.0011";

function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [me, setMe] = useState<Me | null>(null);
  const [companyExists, setCompanyExists] = useState<boolean | null>(null);

  // Company
  const [companyName, setCompanyName] = useState("");
  const [officeStart, setOfficeStart] = useState("09:00");
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [halfDayHours, setHalfDayHours] = useState(5);
  const [weekendDays, setWeekendDays] = useState<string[]>(["Saturday", "Sunday"]);
  const [officeLat, setOfficeLat] = useState(DEFAULT_LAT);
  const [officeLng, setOfficeLng] = useState(DEFAULT_LNG);
  const [radius, setRadius] = useState(150);

  // Admin — comes from the signed-in account (no password needed here).
  const [adminFullName, setAdminFullName] = useState("");

  // License activation (1-device lock).
  const [licenseKey, setLicenseKey] = useState("");
  const [licensePlan, setLicensePlan] = useState<LicensePlan | "master" | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [device, setDevice] = useState<DeviceIdentity | null>(null);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getDeviceFingerprint().then(setDevice).catch(() => undefined);
  }, []);

  useEffect(() => {
    getFirstRunStatus().then((s) => setCompanyExists(s.companyExists)).catch(() => setCompanyExists(false));
    getMe()
      .then((m) => {
        setMe(m);
        setAdminFullName(m.fullName ?? "");
      })
      .catch(() => undefined);
  }, []);

  function toggleDay(day: string) {
    setWeekendDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function setKarachiDefault() {
    setOfficeLat(DEFAULT_LAT);
    setOfficeLng(DEFAULT_LNG);
    toast.success("Karachi IT Park default location set (24.8607, 67.0011)");
  }

  /** Multi-stage resolver: GPS → Wi-Fi GPS → IP geolocation → silent default. */
  async function detectMyLocation() {
    const loc = await getRealUserLocation(true);
    setOfficeLat(loc.lat.toFixed(6));
    setOfficeLng(loc.lng.toFixed(6));
    if (loc.source === "default") {
      toast.info("Offline — using Karachi IT Park default location");
    } else {
      toast.success(`Live location detected (${loc.source === "ip" ? "IP trace" : "GPS"})`);
    }
  }

  /** Validate the license key against the server (no claim yet). */
  async function validateLicense() {
    if (!licenseKey.trim()) {
      setLicenseError("Enter your license key");
      return;
    }
    setValidating(true);
    setLicenseError(null);
    try {
      const result = await validateLicenseKey({ data: { licenseKey: licenseKey.trim(), deviceHash: device?.hash ?? null } });
      if (!result.ok) {
        setLicensePlan(null);
        setLicenseError(result.error ?? "This license key is not valid");
      } else {
        setLicensePlan(result.master ? "master" : result.plan ?? null);
        setLicenseError(null);
        toast.success(result.master ? "Owner master key accepted" : "License verified — ready to activate");
      }
    } catch (err) {
      setLicensePlan(null);
      setLicenseError(err instanceof Error ? err.message : "License check failed");
    } finally {
      setValidating(false);
    }
  }

  function validateStep1(): boolean {
    if (companyName.trim().length < 2) {
      toast.error("Enter the company name");
      return false;
    }
    if (!licensePlan) {
      toast.error("Validate your license key first");
      return false;
    }
    if (weekendDays.length === 0) {
      toast.error("Select at least one weekend day");
      return false;
    }
    const latNum = Number(officeLat);
    const lngNum = Number(officeLng);
    if (
      !Number.isFinite(latNum) || latNum < -90 || latNum > 90 ||
      !Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180
    ) {
      toast.error("Enter valid coordinates (e.g. 24.8607, 67.0011)");
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!validateStep1()) return;
    setLoading(true);
    try {
      const result = await completeFirstRunSetup({
        data: {
          companyName: companyName.trim(),
          officeStart,
          graceMinutes,
          halfDayHours,
          weekendDays,
          officeLat: Number(officeLat),
          officeLng: Number(officeLng),
          geofenceRadiusM: radius,
          adminFullName: adminFullName.trim(),
          licenseKey: licenseKey.trim(),
          deviceHash: device?.hash ?? null,
          deviceInfo: device?.info ?? null,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        setLoading(false);
        return;
      }
      toast.success("Company created — welcome to your new workspace");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
      setLoading(false);
    }
  }

  // Workspace already active — never let a second setup overwrite data.
  if (companyExists) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex items-center justify-center">
              <BrandLogo size={48} />
            </div>
            <CardTitle className="flex items-center justify-center gap-2 text-xl font-bold">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Workspace Active
            </CardTitle>
            <CardDescription>
              A company is already set up in this workspace. Anonymous or duplicate setup is disabled — sign in with
              your Admin or HR account to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => navigate({ to: "/dashboard", replace: true })}>
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <Link to="/org">Update Company Setup</Link>
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.replace("/auth");
              }}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex items-center justify-center">
            <BrandLogo size={48} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Set up your company</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {me?.email ?? "…"} — this account becomes the workspace Admin
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm">
          <span className={step >= 1 ? "flex items-center gap-1 font-medium text-primary" : "flex items-center gap-1 text-muted-foreground"}>
            <Check className="h-4 w-4" /> 1. Company
          </span>
          <span className="text-muted-foreground">→</span>
          <span className={step >= 2 ? "font-medium text-primary" : "text-muted-foreground"}>2. Confirm Admin</span>
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Company profile</CardTitle>
              <CardDescription>These rules decide attendance and leave behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <Label htmlFor="licenseKey" className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> License key (1-device activation)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="licenseKey"
                    value={licenseKey}
                    onChange={(e) => {
                      setLicenseKey(e.target.value.toUpperCase());
                      setLicensePlan(null);
                      setLicenseError(null);
                    }}
                    placeholder="HCM-30D-XXXXXXXX or HCM-LIFE-XXXXXXXX"
                    className="font-mono"
                  />
                  <Button type="button" variant="outline" onClick={validateLicense} disabled={validating || !licenseKey.trim()}>
                    {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Validate
                  </Button>
                </div>
                {licensePlan ? (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ {licensePlan === "master" ? `Owner master key (${MASTER_SETUP_KEY}) — lifetime access` : PLAN_LABELS[licensePlan]} verified
                  </p>
                ) : null}
                {licenseError ? <p className="text-xs font-medium text-destructive">{licenseError}</p> : null}
                <p className="text-xs text-muted-foreground">
                  One license = one device. Don't have a key? Contact Admin on WhatsApp (+92-3140263346).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company name</Label>
                <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Pvt Ltd" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="officeStart">Office start</Label>
                  <Input id="officeStart" type="time" value={officeStart} onChange={(e) => setOfficeStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grace">Grace (min)</Label>
                  <Input id="grace" type="number" min={0} max={120} value={graceMinutes} onChange={(e) => setGraceMinutes(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="halfDay">Half-day &lt; (h)</Label>
                  <Input id="halfDay" type="number" min={1} max={8} value={halfDayHours} onChange={(e) => setHalfDayHours(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Weekend days</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_DAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={
                        weekendDays.includes(day)
                          ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                          : "rounded-full border border-input bg-background px-3 py-1 text-xs text-foreground hover:bg-accent"
                      }
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Office location (for camera check-in geofence)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="officeLat"
                    type="text"
                    inputMode="decimal"
                    value={officeLat}
                    onChange={(e) => setOfficeLat(e.target.value)}
                    placeholder="Latitude (e.g. 24.8607)"
                  />
                  <Input
                    id="officeLng"
                    type="text"
                    inputMode="decimal"
                    value={officeLng}
                    onChange={(e) => setOfficeLng(e.target.value)}
                    placeholder="Longitude (e.g. 67.0011)"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={setKarachiDefault}>
                    📍 Use Karachi IT Park Default (24.8607, 67.0011)
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={detectMyLocation}>
                    <MapPin className="h-4 w-4" /> Detect My Live Location
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={detectMyLocation}>
                    🏢 Sync Office Geofence to My Current Location
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="radius">Geofence radius (meters)</Label>
                <Input id="radius" type="number" min={10} max={10000} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
              </div>
              <Button
                type="button"
                className="w-full gradient-brand text-white"
                onClick={() => {
                  if (validateStep1()) setStep(2);
                }}
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Confirm Admin account</CardTitle>
              <CardDescription>
                Your signed-in account becomes the primary Admin — it manages HR logins, settings and payroll
                finalization. No password is needed here; you are already authenticated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Admin email (from your account)</Label>
                <Input id="adminEmail" type="email" value={me?.email ?? ""} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminName">Full name</Label>
                <Input id="adminName" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} placeholder="Ayesha Khan" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={loading}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1 gradient-brand text-white"
                  onClick={handleSubmit}
                  disabled={loading || adminFullName.trim().length < 2}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Create company
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
