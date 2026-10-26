import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Check, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { completeFirstRunSetup } from "@/lib/setup.functions";
import { getRealUserLocation } from "@/lib/geo";
import { PasswordStrengthChecklist, isPasswordStrong } from "@/components/password-checklist";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "First-run setup — HCM Lite" },
      { name: "description", content: "Create your company profile and the Admin account for HCM Lite." },
      { property: "og:title", content: "First-run setup — HCM Lite" },
      { property: "og:description", content: "Create your company profile and the Admin account for HCM Lite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
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

  // Company
  const [companyName, setCompanyName] = useState("");
  const [officeStart, setOfficeStart] = useState("09:00");
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [halfDayHours, setHalfDayHours] = useState(5);
  const [weekendDays, setWeekendDays] = useState<string[]>(["Saturday", "Sunday"]);
  const [officeLat, setOfficeLat] = useState(DEFAULT_LAT);
  const [officeLng, setOfficeLng] = useState(DEFAULT_LNG);
  const [radius, setRadius] = useState(150);

  // Admin
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [loading, setLoading] = useState(false);

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

  function validateStep1(): boolean {
    if (companyName.trim().length < 2) {
      toast.error("Enter the company name");
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

  function validateStep2(): boolean {
    if (adminFullName.trim().length < 2) {
      toast.error("Enter the Admin name");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      toast.error("Enter a valid Admin email");
      return false;
    }
    if (!isPasswordStrong(adminPassword)) {
      toast.error("Admin password must meet all 5 requirements below");
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!validateStep2()) return;
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
          adminEmail: adminEmail.trim(),
          adminPassword,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        setLoading(false);
        return;
      }
      // Auto sign-in: the Admin account is created and email-confirmed
      // server-side, so the credentials just typed can sign straight in.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword,
      });
      if (signInError) {
        toast.success("Company created! Please sign in with the Admin account.");
        navigate({ to: "/auth", replace: true });
        return;
      }
      toast.success("Company created — you are signed in as Admin");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to HCM Lite</h1>
          <p className="mt-1 text-sm text-muted-foreground">First-run setup — create your company and Admin account</p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm">
          <span className={step >= 1 ? "flex items-center gap-1 font-medium text-primary" : "flex items-center gap-1 text-muted-foreground"}>
            <Check className="h-4 w-4" /> 1. Company
          </span>
          <span className="text-muted-foreground">→</span>
          <span className={step >= 2 ? "font-medium text-primary" : "text-muted-foreground"}>2. Admin account</span>
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Company profile</CardTitle>
              <CardDescription>These rules decide attendance and leave behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                className="w-full"
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
              <CardTitle>Admin account</CardTitle>
              <CardDescription>The primary Admin — can manage HR logins, settings and payroll finalization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="adminName">Full name</Label>
                <Input id="adminName" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} placeholder="Ayesha Khan" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Email</Label>
                <Input id="adminEmail" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminPassword">Password</Label>
                <Input id="adminPassword" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••••••" />
                <PasswordStrengthChecklist password={adminPassword} />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={loading}>
                  Back
                </Button>
                <Button type="button" className="flex-1" onClick={handleSubmit} disabled={loading || !isPasswordStrong(adminPassword)}>
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
