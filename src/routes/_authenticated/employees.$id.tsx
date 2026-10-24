import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Loader2, Mail, MapPin, Pencil, Phone } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEmployee360, updateEmployee, updateMyContact, type Employee360 } from "@/lib/employees.functions";
import { getOrgData } from "@/lib/org.functions";
import { StatusBadge } from "@/routes/_authenticated/employees";

export const Route = createFileRoute("/_authenticated/employees/$id")({
  component: Employee360Page,
});

function Employee360Page() {
  const params = Route.useParams();
  const employeeId = params.id as string;

  const get360Fn = useServerFn(getEmployee360);
  const { data, isLoading, error } = useQuery({
    queryKey: ["employee360", employeeId],
    queryFn: () => get360Fn({ data: { employeeId } }),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold text-foreground">Employee 360</h1>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/employees"><ArrowLeft className="mr-1 h-4 w-4" /> Directory</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profile…
          </div>
        )}
        {error && (
          <Card className="border-destructive">
            <CardContent className="py-6 text-sm text-destructive">{(error as Error).message}</CardContent>
          </Card>
        )}
        {data && <ProfileBody data={data} />}
      </main>
    </div>
  );
}

function ProfileBody({ data }: { data: Employee360 }) {
  const e = data.employee;
  const canSeeSalary = data.viewer.canManage || data.viewer.canEditContact;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{e.full_name}</h2>
              <StatusBadge status={e.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {e.employee_code} · {e.email}
            </p>
          </div>
          {data.viewer.canManage && <EditEmployeeDialog employee={data} />}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> Job details</CardDescription>
            <CardTitle className="text-base">Employment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Department" value={e.department_name ?? "—"} />
            <Row label="Designation" value={e.designation_name ?? "—"} />
            <Row label="Join date" value={e.join_date} />
            <Row label="Exit date" value={e.exit_date ?? "—"} />
            <Row label="Gender" value={e.gender ?? "—"} />
            {canSeeSalary && (
              <>
                <Row label="Basic salary" value={`PKR ${e.basic_salary.toLocaleString()}`} />
                <Row label="Gross salary (1.5 × basic)" value={`PKR ${(e.basic_salary * 1.5).toLocaleString()}`} />
              </>
            )}
          </CardContent>
        </Card>

        <ContactCard data={data} />

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Attendance — last {data.recentAttendance.length} record(s)</CardTitle>
            <CardDescription>
              Present {data.counts.present} · Late {data.counts.late} · Half-day {data.counts.halfDay} · Missing checkout {data.counts.missingCheckout}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentAttendance.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-muted-foreground">No attendance recorded yet.</TableCell></TableRow>
                )}
                {data.recentAttendance.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.work_date}</TableCell>
                    <TableCell>{r.check_in ? new Date(r.check_in).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                    <TableCell>{r.check_out ? new Date(r.check_out).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function ContactCard({ data }: { data: Employee360 }) {
  const e = data.employee;
  const [phone, setPhone] = useState(e.phone ?? "");
  const [address, setAddress] = useState(e.address ?? "");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const updateFn = useServerFn(updateMyContact);

  async function save() {
    setSaving(true);
    const result = await updateFn({ data: { phone: phone || null, address: address || null } });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Contact details updated");
    await qc.invalidateQueries({ queryKey: ["employee360"] });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1"><Phone className="h-3 w-3" /> Contact</CardDescription>
        <CardTitle className="text-base">Personal contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3 w-3" /> {e.email}</div>
        {data.viewer.canEditContact ? (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="my-phone">Phone</Label>
              <Input id="my-phone" value={phone} onChange={(ev) => setPhone(ev.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-address" className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</Label>
              <Input id="my-address" value={address} onChange={(ev) => setAddress(ev.target.value)} />
            </div>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </div>
        ) : (
          <>
            <Row label="Phone" value={e.phone ?? "—"} />
            <Row label="Address" value={e.address ?? "—"} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EditEmployeeDialog({ employee }: { employee: Employee360 }) {
  const e = employee.employee;
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(e.full_name);
  const [dept, setDept] = useState(e.department_id ?? "none");
  const [desig, setDesig] = useState(e.designation_id ?? "none");
  const [salary, setSalary] = useState(String(e.basic_salary));
  const [status, setStatus] = useState(e.status);
  const [exitDate, setExitDate] = useState(e.exit_date ?? "");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const orgFn = useServerFn(getOrgData);
  const { data: org } = useQuery({ queryKey: ["org"], queryFn: () => orgFn() });
  const updateFn = useServerFn(updateEmployee);

  async function save() {
    setSaving(true);
    const result = await updateFn({
      data: {
        employeeId: e.id,
        fullName,
        departmentId: dept === "none" ? null : dept,
        designationId: desig === "none" ? null : desig,
        basicSalary: Number(salary),
        status,
        exitDate: exitDate === "" ? null : exitDate,
      },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Employee updated");
    setOpen(false);
    await qc.invalidateQueries({ queryKey: ["employee360"] });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="mr-1 h-4 w-4" /> Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit employee</DialogTitle>
            <DialogDescription>Job details and status. Every change is audit-logged.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-name">Full name</Label>
              <Input id="edit-name" value={fullName} onChange={(ev) => setFullName(ev.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(org?.departments ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Select value={desig} onValueChange={setDesig}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(org?.designations ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-salary">Basic salary (PKR)</Label>
              <Input id="edit-salary" type="number" min={1} value={salary} onChange={(ev) => setSalary(ev.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="exited">Exited</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-exit">Exit date (optional)</Label>
              <Input id="edit-exit" type="date" value={exitDate} onChange={(ev) => setExitDate(ev.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
