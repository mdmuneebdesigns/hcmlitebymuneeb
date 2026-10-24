import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  LogIn,
  LogOut,
  Loader2,
  MapPin,
  Camera,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMe, type Me } from "@/lib/auth.functions";
import {
  checkIn,
  checkOut,
  decideCorrection,
  getDayBoard,
  getMyAttendance,
  getMyToday,
  listAllCorrections,
  listMyCorrections,
  requestCorrection,
  type DayBoardRow,
} from "@/lib/attendance.functions";
import { pktStamp } from "@/lib/rules/attendance-rules";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/attendance")({
  loader: () => getMe(),
  component: AttendancePage,
});

interface Geo {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
}

function getPosition(): Promise<Geo> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ lat: null, lng: null, accuracyM: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
      () => resolve({ lat: null, lng: null, accuracyM: null }),
      { timeout: 8000, maximumAge: 30000 },
    );
  });
}

interface FaceCheckResult {
  ok: boolean;
  faceOk: boolean;
  note?: string | undefined;
}

function AttendancePage() {
  const me = Route.useLoaderData() as Me;
  const isManager = me.roles.includes("hr") || me.roles.includes("admin");
  const today = pktStamp(new Date()).date;

  const qc = useQueryClient();

  const todayFn = useServerFn(getMyToday);
  const { data: todayData } = useQuery({
    queryKey: ["my-today"],
    queryFn: () => todayFn(),
  });

  const checkInFn = useServerFn(checkIn);
  const checkOutFn = useServerFn(checkOut);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);

  // Camera (face) verification for check-in
  const [faceVerify, setFaceVerify] = useState(true);
  const [camOpen, setCamOpen] = useState(false);
  const camResolver = useRef<((r: FaceCheckResult) => void) | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function openCamera(): Promise<FaceCheckResult> {
    setCamOpen(true);
    return new Promise<FaceCheckResult>((resolve) => {
      camResolver.current = resolve;
      // Start the stream once the <video> element mounts.
      setTimeout(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: 480, height: 360 },
            audio: false,
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => undefined);
          }
        } catch {
          camResolver.current?.({ ok: false, faceOk: false });
          camResolver.current = null;
          setCamOpen(false);
        }
      }, 50);
    });
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOpen(false);
  }

  async function verifyFaceNow() {
    const faceOk = true;
    let note: string | undefined;
    const video = videoRef.current;
    const detector = (window as unknown as { FaceDetector?: new (o?: object) => { detect: (s: unknown) => Promise<{ length: number }> } }).FaceDetector;
    if (video && detector) {
      try {
        const faces = await new detector({ fastMode: true, maxDetectedFaces: 1 }).detect(video);
        faceOk = faces.length >= 1;
        if (!faceOk) note = "No face detected — make sure you are in frame";
      } catch {
        note = "Face detector could not run — camera frame accepted";
      }
    } else {
      note = "Camera frame accepted (browser face API not available)";
    }
    const r: FaceCheckResult = { ok: faceOk, faceOk, note };
    camResolver.current?.(r);
    camResolver.current = null;
    stopCamera();
    if (!r.ok && note) toast.error(note);
  }

  function skipFace() {
    camResolver.current?.({ ok: true, faceOk: false, note: "Checked in without camera verification" });
    camResolver.current = null;
    stopCamera();
  }

  async function punch(kind: "in" | "out") {
    setBusy(kind);
    let faceOk: boolean | undefined;
    if (kind === "in" && faceVerify) {
      const cam = await openCamera();
      if (!cam.ok) {
        setBusy(null);
        return; // camera denied or no face — toast already shown / dialog cancelled
      }
      faceOk = cam.faceOk;
      if (cam.note) toast.info(cam.note);
    }
    const geo = await getPosition();
    const result = kind === "in"
      ? await checkInFn({ data: { lat: geo.lat, lng: geo.lng, accuracyM: geo.accuracyM, faceOk } })
      : await checkOutFn({ data: { lat: geo.lat, lng: geo.lng, accuracyM: geo.accuracyM } });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error, { duration: 6000 });
      return;
    }
    toast.success(
      kind === "in"
        ? `Checked in at ${result.time} (${result.status})`
        : `Checked out at ${result.time} — day status: ${result.status.replace("_", " ")}`,
    );
    await qc.invalidateQueries({ queryKey: ["my-today"] });
    await qc.invalidateQueries({ queryKey: ["my-attendance"] });
    await qc.invalidateQueries({ queryKey: ["day-board"] });
  }

  const record = todayData?.record ?? null;
  const checkedIn = record?.check_in != null;
  const checkedOut = record?.check_out != null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold text-foreground">Attendance</h1>
          <Button variant="ghost" size="sm" asChild><Link to="/dashboard">Dashboard</Link></Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Today · {today} {todayData?.weekend ? "(weekend)" : ""}</CardTitle>
            <CardDescription>
              The server stamps the exact time. One check-in per day; late after office start + grace.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button onClick={() => punch("in")} disabled={busy !== null || checkedIn}>
              {busy === "in" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <LogIn className="mr-1 h-4 w-4" />}
              {checkedIn ? "Checked in" : "Check in"}
            </Button>
            <Button onClick={() => punch("out")} disabled={busy !== null || !checkedIn || checkedOut} variant="outline">
              {busy === "out" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <LogOut className="mr-1 h-4 w-4" />}
              {checkedOut ? "Checked out" : "Check out"}
            </Button>
            {!checkedIn && (
              <label className="ml-2 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={faceVerify}
                  onChange={(e) => setFaceVerify(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <Camera className="h-3.5 w-3.5" /> Verify face + location on check-in
              </label>
            )}
            {record && (
              <div className="ml-auto flex items-center gap-2 text-sm">
                <StatusBadge status={record.status} />
                <span className="text-muted-foreground">
                  In {record.check_in ? new Date(record.check_in).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  {" · "}Out {record.check_out ? new Date(record.check_out).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
                {record.distance_m != null && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {Math.round(record.distance_m)} m from office
                  </span>
                )}
              </div>
            )}
            {!record && <span className="ml-auto text-sm text-muted-foreground">No attendance yet today.</span>}
          </CardContent>
        </Card>

        <Tabs defaultValue="my">
          <TabsList className="flex-wrap">
            <TabsTrigger value="my" className="gap-1"><CalendarDays className="h-3.5 w-3.5" /> My attendance</TabsTrigger>
            {isManager && (
              <TabsTrigger value="board" className="gap-1"><Users className="h-3.5 w-3.5" /> Daily board</TabsTrigger>
            )}
            <TabsTrigger value="corrections">Corrections</TabsTrigger>
          </TabsList>
          <TabsContent value="my" className="mt-4"><MyAttendanceTab today={today} /></TabsContent>
          {isManager && <TabsContent value="board" className="mt-4"><DailyBoardTab today={today} /></TabsContent>}
          <TabsContent value="corrections" className="mt-4">
            <CorrectionsTab isManager={isManager} today={today} />
          </TabsContent>
        </Tabs>

        {camOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-xl border bg-background p-4 shadow-2xl">
              <p className="text-sm font-semibold text-foreground">Face verification</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Look straight at the camera, then press verify. Video never leaves your device — nothing is stored or uploaded.
              </p>
              <video ref={videoRef} autoPlay muted playsInline className="mx-auto w-full max-w-sm rounded-lg border bg-black" />
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" onClick={skipFace}>
                  Skip face check
                </Button>
                <Button onClick={verifyFaceNow}>
                  <Camera className="mr-1 h-4 w-4" /> Verify & check in
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- My attendance ----------

function MyAttendanceTab({ today }: { today: string }) {
  const from = pktStamp(new Date(Date.now() - 30 * 86400000)).date;
  const fn = useServerFn(getMyAttendance);
  const { data, isLoading } = useQuery({
    queryKey: ["my-attendance", from, today],
    queryFn: () => fn({ data: { from, to: today } }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Last 30 days</CardTitle>
        <CardDescription>Your check-in / check-out history, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Distance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {data?.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">No attendance in this period.</TableCell></TableRow>
            )}
            {data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.work_date}</TableCell>
                <TableCell>{r.check_in ? new Date(r.check_in).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                <TableCell>{r.check_out ? new Date(r.check_out).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell>{r.distance_m != null ? `${Math.round(r.distance_m)} m` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------- Daily board (HR/Admin) ----------

function DailyBoardTab({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const fn = useServerFn(getDayBoard);
  const { data, isLoading } = useQuery({
    queryKey: ["day-board", date],
    queryFn: () => fn({ data: { date } }),
  });

  const summary = summarize(data ?? []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Daily attendance board</CardTitle>
          <CardDescription>
            Present {summary.present} · Late {summary.late} · Half-day {summary.halfDay} · Missing checkout {summary.missingCheckout} · Absent {summary.absent}
          </CardDescription>
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Out</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {data?.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No active employees yet.</TableCell></TableRow>
            )}
            {data?.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.department ?? "—"}</TableCell>
                <TableCell>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                <TableCell>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function summarize(rows: DayBoardRow[]) {
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    present: count("present"),
    late: count("late"),
    halfDay: count("half_day"),
    missingCheckout: count("missing_checkout"),
    absent: count("absent"),
  };
}

// ---------- Corrections ----------

function CorrectionsTab({ isManager, today }: { isManager: boolean; today: string }) {
  return (
    <div className="space-y-4">
      {!isManager && <CorrectionRequestForm today={today} />}
      {isManager ? <CorrectionInbox /> : <MyCorrections />}
    </div>
  );
}

function CorrectionRequestForm({ today }: { today: string }) {
  const qc = useQueryClient();
  const [workDate, setWorkDate] = useState(today);
  const [field, setField] = useState("check_in");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const fn = useServerFn(requestCorrection);

  async function submit() {
    setSaving(true);
    const result = await fn({ data: { workDate, field, time, reason } });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Correction request submitted — HR will review it");
    setTime("");
    setReason("");
    await qc.invalidateQueries({ queryKey: ["my-corrections"] });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Request an attendance correction</CardTitle>
        <CardDescription>Wrong check-in/out time? Ask HR to fix it — with a reason.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="corr-date">Date</Label>
          <Input id="corr-date" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label>Field</Label>
          <Select value={field} onValueChange={setField}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="check_in">Check-in</SelectItem>
              <SelectItem value="check_out">Check-out</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="corr-time">Correct time (HH:MM)</Label>
          <Input id="corr-time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:05" className="w-28" />
        </div>
        <div className="flex-1 min-w-52 space-y-1.5">
          <Label htmlFor="corr-reason">Reason</Label>
          <Input id="corr-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Internet was down, I checked in from the office gate" />
        </div>
        <Button onClick={submit} disabled={saving || time.trim() === "" || reason.trim().length < 5}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Submit
        </Button>
      </CardContent>
    </Card>
  );
}

function MyCorrections() {
  const fn = useServerFn(listMyCorrections);
  const { data } = useQuery({ queryKey: ["my-corrections"], queryFn: () => fn() });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">My correction requests</CardTitle>
      </CardHeader>
      <CardContent>
        <CorrectionTable rows={data ?? []} showEmployee={false} />
      </CardContent>
    </Card>
  );
}

function CorrectionInbox() {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const listFn = useServerFn(listAllCorrections);
  const decideFn = useServerFn(decideCorrection);
  const { data } = useQuery({ queryKey: ["corrections-inbox"], queryFn: () => listFn() });

  const pending = (data ?? []).filter((r) => r.status === "pending");
  const decided = (data ?? []).filter((r) => r.status !== "pending");

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    const result = await decideFn({ data: { id, decision, comment } });
    setBusyId(null);
    setComment("");
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(decision === "approved" ? "Correction approved" : "Correction rejected");
    await qc.invalidateQueries({ queryKey: ["corrections-inbox"] });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pending requests ({pending.length})</CardTitle>
          <CardDescription>Optional comment is attached to the decision.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Decision comment (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <CorrectionTable rows={pending} showEmployee onDecide={decide} busyId={busyId} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Decided</CardTitle>
        </CardHeader>
        <CardContent>
          <CorrectionTable rows={decided} showEmployee />
        </CardContent>
      </Card>
    </div>
  );
}

function CorrectionTable({
  rows,
  showEmployee,
  onDecide,
  busyId,
}: {
  rows: Awaited<ReturnType<typeof listAllCorrections>>;
  showEmployee: boolean;
  onDecide?: (id: string, decision: "approved" | "rejected") => Promise<void>;
  busyId?: string | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showEmployee && <TableHead>Employee</TableHead>}
          <TableHead>Date</TableHead>
          <TableHead>Field</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Status</TableHead>
          {onDecide && <TableHead className="text-right">Decision</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={onDecide ? 7 : 6} className="text-muted-foreground">Nothing here yet.</TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.id}>
            {showEmployee && <TableCell className="font-medium">{r.employee_name ?? "—"}</TableCell>}
            <TableCell>{r.work_date}</TableCell>
            <TableCell>{r.field === "check_in" ? "Check-in" : "Check-out"}</TableCell>
            <TableCell>{new Date(r.requested_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</TableCell>
            <TableCell className="max-w-64 truncate" title={r.reason}>{r.reason}</TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
              {r.decision_comment && <div className="text-xs text-muted-foreground">{r.decision_comment}</div>}
            </TableCell>
            {onDecide && (
              <TableCell className="text-right">
                {busyId === r.id ? (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                ) : (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => void onDecide(r.id, "approved")}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void onDecide(r.id, "rejected")}>Reject</Button>
                  </div>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
