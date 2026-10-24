import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Clock, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMe, type Me } from "@/lib/auth.functions";
import {
  createDepartment,
  createDesignation,
  createHoliday,
  createLeaveType,
  deleteDepartment,
  deleteDesignation,
  deleteHoliday,
  deleteLeaveType,
  getOrgData,
  updateCompanySettings,
  updateDepartment,
  updateDesignation,
  updateLeaveType,
  type OrgData,
} from "@/lib/org.functions";

export const Route = createFileRoute("/_authenticated/org")({
  loader: async () => {
    const me = await getMe();
    if (!me.roles.includes("admin")) throw redirect({ to: "/dashboard" });
    return me;
  },
  component: OrgPage,
});

function OrgPage() {
  const getOrgDataFn = useServerFn(getOrgData);
  const { data, isLoading } = useQuery({ queryKey: ["org"], queryFn: () => getOrgDataFn() });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold text-foreground">Organization setup</h1>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>

        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {isLoading || !data ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading organization data…
          </div>
        ) : (
          <Tabs defaultValue="departments">
            <TabsList className="flex-wrap">
              <TabsTrigger value="departments">Departments</TabsTrigger>
              <TabsTrigger value="designations">Designations</TabsTrigger>
              <TabsTrigger value="leave">Leave types</TabsTrigger>
              <TabsTrigger value="holidays">Holidays</TabsTrigger>
              <TabsTrigger value="settings">Office settings</TabsTrigger>
            </TabsList>
            <TabsContent value="departments" className="mt-4">
              <DepartmentsTab data={data} />
            </TabsContent>
            <TabsContent value="designations" className="mt-4">
              <DesignationsTab data={data} />
            </TabsContent>
            <TabsContent value="leave" className="mt-4">
              <LeaveTypesTab data={data} />
            </TabsContent>
            <TabsContent value="holidays" className="mt-4">
              <HolidaysTab data={data} />
            </TabsContent>
            <TabsContent value="settings" className="mt-4">
              <SettingsTab data={data} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

// ---------- Departments ----------

function DepartmentsTab({ data }: { data: OrgData }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const createFn = useServerFn(createDepartment);
  const updateFn = useServerFn(updateDepartment);
  const deleteFn = useServerFn(deleteDepartment);

  function openAdd() {
    setEditingId(null);
    setName("");
    setDialogOpen(true);
  }

  function openEdit(id: string, current: string) {
    setEditingId(id);
    setName(current);
    setDialogOpen(true);
  }

  async function save() {
    const result = editingId
      ? await updateFn({ data: { id: editingId, name } })
      : await createFn({ data: { name } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(editingId ? "Department updated" : "Department added");
    setDialogOpen(false);
    await qc.invalidateQueries({ queryKey: ["org"] });
  }

  async function remove(id: string) {
    const result = await deleteFn({ data: { id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Department deleted");
    await qc.invalidateQueries({ queryKey: ["org"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg">Departments</CardTitle>
          <CardDescription>Groups used across the directory, filters and payroll.</CardDescription>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.departments.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-muted-foreground">No departments yet.</TableCell>
              </TableRow>
            )}
            {data.departments.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(d.id, d.name)} aria-label={`Edit ${d.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(d.id)} aria-label={`Delete ${d.name}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit department" : "Add department"}</DialogTitle>
            <DialogDescription>Department names must be unique.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dept-name">Name</Label>
            <Input id="dept-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={name.trim().length < 2}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- Designations ----------

function DesignationsTab({ data }: { data: OrgData }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("none");

  const createFn = useServerFn(createDesignation);
  const updateFn = useServerFn(updateDesignation);
  const deleteFn = useServerFn(deleteDesignation);

  function openAdd() {
    setEditingId(null);
    setName("");
    setDepartmentId("none");
    setDialogOpen(true);
  }

  function openEdit(id: string, currentName: string, currentDept: string | null) {
    setEditingId(id);
    setName(currentName);
    setDepartmentId(currentDept ?? "none");
    setDialogOpen(true);
  }

  async function save() {
    const dept = departmentId === "none" ? null : departmentId;
    const result = editingId
      ? await updateFn({ data: { id: editingId, name, departmentId: dept } })
      : await createFn({ data: { name, departmentId: dept } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(editingId ? "Designation updated" : "Designation added");
    setDialogOpen(false);
    await qc.invalidateQueries({ queryKey: ["org"] });
  }

  async function remove(id: string) {
    const result = await deleteFn({ data: { id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Designation deleted");
    await qc.invalidateQueries({ queryKey: ["org"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg">Designations</CardTitle>
          <CardDescription>Job titles, optionally linked to a department.</CardDescription>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.designations.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">No designations yet.</TableCell>
              </TableRow>
            )}
            {data.designations.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>{d.department_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(d.id, d.name, d.department_id)} aria-label={`Edit ${d.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(d.id)} aria-label={`Delete ${d.name}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit designation" : "Add designation"}</DialogTitle>
            <DialogDescription>Optionally attach it to a department.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="desig-name">Name</Label>
              <Input id="desig-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Software Engineer" />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="No department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department</SelectItem>
                  {data.departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={name.trim().length < 2}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- Leave types ----------

function LeaveTypesTab({ data }: { data: OrgData }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [quota, setQuota] = useState("0");
  const [paid, setPaid] = useState(true);

  const createFn = useServerFn(createLeaveType);
  const updateFn = useServerFn(updateLeaveType);
  const deleteFn = useServerFn(deleteLeaveType);

  function openAdd() {
    setEditingId(null);
    setName("");
    setQuota("0");
    setPaid(true);
    setDialogOpen(true);
  }

  function openEdit(id: string, lt: { name: string; annual_quota: number; is_paid: boolean }) {
    setEditingId(id);
    setName(lt.name);
    setQuota(String(lt.annual_quota));
    setPaid(lt.is_paid);
    setDialogOpen(true);
  }

  async function save() {
    const payload = { name, annualQuota: Number(quota) || 0, isPaid: paid };
    const result = editingId
      ? await updateFn({ data: { id: editingId, ...payload } })
      : await createFn({ data: payload });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(editingId ? "Leave type updated" : "Leave type added");
    setDialogOpen(false);
    await qc.invalidateQueries({ queryKey: ["org"] });
  }

  async function remove(id: string) {
    const result = await deleteFn({ data: { id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Leave type deleted");
    await qc.invalidateQueries({ queryKey: ["org"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg">Leave types &amp; yearly quotas</CardTitle>
          <CardDescription>Defaults from the setup wizard: Annual 14, Sick 8, Casual 10, Unpaid unlimited.</CardDescription>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Yearly quota (days)</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.leaveTypes.map((lt) => (
              <TableRow key={lt.id}>
                <TableCell className="font-medium">{lt.name}</TableCell>
                <TableCell>{lt.annual_quota === 0 ? "Unlimited" : lt.annual_quota}</TableCell>
                <TableCell>
                  <Badge variant={lt.is_paid ? "secondary" : "outline"}>{lt.is_paid ? "Paid" : "Unpaid"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(lt.id, lt)} aria-label={`Edit ${lt.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(lt.id)} aria-label={`Delete ${lt.name}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit leave type" : "Add leave type"}</DialogTitle>
            <DialogDescription>Quota 0 means unlimited days.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="lt-name">Name</Label>
              <Input id="lt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lt-quota">Yearly quota (days, 0 = unlimited)</Label>
              <Input id="lt-quota" type="number" min={0} value={quota} onChange={(e) => setQuota(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="lt-paid">Paid leave</Label>
              <Switch id="lt-paid" checked={paid} onCheckedChange={setPaid} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={name.trim().length < 2}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- Holidays ----------

function HolidaysTab({ data }: { data: OrgData }) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const createFn = useServerFn(createHoliday);
  const deleteFn = useServerFn(deleteHoliday);

  async function add() {
    const result = await createFn({ data: { holidayDate: date, name } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Holiday added");
    setDate("");
    setName("");
    await qc.invalidateQueries({ queryKey: ["org"] });
  }

  async function remove(id: string) {
    const result = await deleteFn({ data: { id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Holiday removed");
    await qc.invalidateQueries({ queryKey: ["org"] });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Public holidays</CardTitle>
        <CardDescription>These days are excluded from working-day calculations.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="holiday-date">Date</Label>
            <Input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="holiday-name">Name</Label>
            <Input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Independence Day" />
          </div>
          <Button onClick={add} disabled={date === "" || name.trim().length < 2}>
            <Plus className="mr-1 h-4 w-4" /> Add holiday
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.holidays.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">No holidays added yet.</TableCell>
              </TableRow>
            )}
            {data.holidays.map((h) => (
              <TableRow key={h.id}>
                <TableCell><span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3 text-muted-foreground" />{h.holiday_date}</span></TableCell>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => remove(h.id)} aria-label={`Delete ${h.name}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------- Office settings ----------

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function SettingsTab({ data }: { data: OrgData }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [officeStart, setOfficeStart] = useState("09:00");
  const [grace, setGrace] = useState("15");
  const [halfDay, setHalfDay] = useState("5");
  const [weekend, setWeekend] = useState<string[]>(["Saturday", "Sunday"]);
  const [lat, setLat] = useState("0");
  const [lng, setLng] = useState("0");
  const [radius, setRadius] = useState("150");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = data.company;
    if (!c) return;
    setName(c.name);
    setOfficeStart(c.office_start);
    setGrace(String(c.grace_minutes));
    setHalfDay(String(c.half_day_hours));
    setWeekend(c.weekend_days);
    setLat(String(c.office_lat));
    setLng(String(c.office_lng));
    setRadius(String(c.geofence_radius_m));
  }, [data.company]);

  const updateFn = useServerFn(updateCompanySettings);

  async function save() {
    setSaving(true);
    const result = await updateFn({
      data: {
        name,
        officeStart,
        graceMinutes: Number(grace) || 0,
        halfDayHours: Number(halfDay) || 5,
        weekendDays: weekend,
        officeLat: Number(lat) || 0,
        officeLng: Number(lng) || 0,
        geofenceRadiusM: Number(radius) || 150,
      },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Office settings saved");
    await qc.invalidateQueries({ queryKey: ["org"] });
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Your browser does not support location");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        toast.success("Current location captured");
      },
      () => toast.error("Could not get your location — enter coordinates manually"),
      { timeout: 8000 },
    );
  }

  function toggleWeekend(day: string) {
    setWeekend((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Office settings</CardTitle>
        <CardDescription>Attendance rules and the check-in geofence come from here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="co-name">Company name</Label>
            <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-start" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Office start (HH:MM)</Label>
            <Input id="co-start" value={officeStart} onChange={(e) => setOfficeStart(e.target.value)} placeholder="09:00" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-grace">Grace minutes</Label>
            <Input id="co-grace" type="number" min={0} max={120} value={grace} onChange={(e) => setGrace(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-half">Half-day threshold (hours)</Label>
            <Input id="co-half" type="number" min={1} max={8} step={0.5} value={halfDay} onChange={(e) => setHalfDay(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-radius">Geofence radius (meters)</Label>
            <Input id="co-radius" type="number" min={10} max={10000} value={radius} onChange={(e) => setRadius(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Weekend days</Label>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleWeekend(d)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    weekend.includes(d)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-lat" className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Office latitude</Label>
            <Input id="co-lat" value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-lng">Office longitude</Label>
            <Input id="co-lng" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={useMyLocation}>Use my current location</Button>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save settings
        </Button>
      </CardContent>
    </Card>
  );
}
