import { useRef, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";

import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  Loader2,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
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
import { getMe, type Me } from "@/lib/auth.functions";
import {
  createEmployee,
  createHrLogin,
  csvDryRun,
  csvImport,
  listDirectory,
  type DirectoryPage,
} from "@/lib/employees.functions";
import { parseCsv, toCsv } from "@/lib/rules/csv-rules";
import { getOrgData } from "@/lib/org.functions";

export const Route = createFileRoute("/_authenticated/employees")({
  loader: async () => {
    const me = await getMe();
    if (!me.roles.includes("hr") && !me.roles.includes("admin")) {
      throw redirect({ to: "/dashboard" });
    }
    return me;
  },
  component: EmployeesPage,
});

const PAGE_SIZE = 10;

function EmployeesPage() {
  const me = Route.useLoaderData() as Me;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [hrOpen, setHrOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const orgFn = useServerFn(getOrgData);
  const { data: org } = useQuery({ queryKey: ["org"], queryFn: () => orgFn() });

  const listFn = useServerFn(listDirectory);
  const { data, isLoading } = useQuery({
    queryKey: ["directory", search, deptFilter, statusFilter, page],
    queryFn: () =>
      listFn({
        data: {
          search,
          departmentId: deptFilter === "all" ? null : deptFilter,
          status: statusFilter === "all" ? null : statusFilter,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const listFnForExport = useServerFn(listDirectory);

  async function exportCsv() {
    setExporting(true);
    try {
      const all: DirectoryPage["rows"] = [];
      let p = 0;
      for (;;) {
        const res = await listFnForExport({
          data: {
            search,
            departmentId: deptFilter === "all" ? null : deptFilter,
            status: statusFilter === "all" ? null : statusFilter,
            page: p,
            pageSize: 100,
          },
        });
        all.push(...res.rows);
        if (all.length >= res.total || res.rows.length === 0) break;
        p++;
      }
      const csv = toCsv(
        all.map((r) => ({
          employee_code: r.employee_code,
          full_name: r.full_name,
          email: r.email,
          phone: (r as { phone?: string | null }).phone ?? "",
          address: (r as { address?: string | null }).address ?? "",
          department: r.department_name ?? "",
          designation: r.designation_name ?? "",
          join_date: r.join_date,
          basic_salary: r.basic_salary,
          gender: (r as { gender?: string | null }).gender ?? "",
        })),
      );
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "employees.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length} employees`);
    } finally {
      setExporting(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold text-foreground">Employee directory</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/dashboard">Dashboard</Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name, email or code…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <Select
            value={deptFilter}
            onValueChange={(v) => {
              setDeptFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-44"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {(org?.departments ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-36"><SelectValue placeholder="Any status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="exited">Exited</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" /> Register employee
          </Button>
          {me.roles.includes("admin") && (
            <Button size="sm" variant="outline" onClick={() => setHrOpen(true)}>
              <ShieldCheck className="mr-1 h-4 w-4" /> Create HR login
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>
            <FileUp className="mr-1 h-4 w-4" /> Import CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} Export
          </Button>
        </div>

        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                )}
                {!isLoading && data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No employees match. Register your first employee.
                    </TableCell>
                  </TableRow>
                )}
                {data?.rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate({ to: "/employees/$id", params: { id: r.id } })}>
                    <TableCell className="font-mono text-xs">{r.employee_code}</TableCell>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell>{r.department_name ?? "—"}</TableCell>
                    <TableCell>{r.designation_name ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>{data ? `${data.total} employee(s)` : ""}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span>Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="icon" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <AddEmployeeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        departments={org?.departments ?? []}
        designations={org?.designations ?? []}
        onCreated={() => qc.invalidateQueries({ queryKey: ["directory"] })}
      />
      <HrLoginDialog open={hrOpen} onOpenChange={setHrOpen} />
      <CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} onImported={() => qc.invalidateQueries({ queryKey: ["directory"] })} />
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    present: { label: "Present", className: "bg-emerald-100 text-emerald-800" },
    late: { label: "Late", className: "bg-amber-100 text-amber-800" },
    half_day: { label: "Half day", className: "bg-orange-100 text-orange-800" },
    missing_checkout: { label: "Missing checkout", className: "bg-sky-100 text-sky-800" },
    absent: { label: "Absent", className: "bg-red-100 text-red-800" },
    active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
    inactive: { label: "Inactive", className: "bg-zinc-100 text-zinc-700" },
    exited: { label: "Exited", className: "bg-zinc-100 text-zinc-700" },
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
    approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  };
  const entry = map[status];
  return (
    <Badge variant="secondary" className={entry?.className}>
      {entry?.label ?? status}
    </Badge>
  );
}

// ---------- Register employee ----------

function AddEmployeeDialog({
  open,
  onOpenChange,
  departments,
  designations,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  departments: Array<{ id: string; name: string }>;
  designations: Array<{ id: string; name: string; department_id: string | null }>;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [dept, setDept] = useState("none");
  const [desig, setDesig] = useState("none");
  const [joinDate, setJoinDate] = useState("");
  const [salary, setSalary] = useState("");
  const [gender, setGender] = useState("none");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; tempPassword: string } | null>(null);

  const createFn = useServerFn(createEmployee);

  async function submit() {
    setSaving(true);
    const result = await createFn({
      data: {
        employeeCode: code,
        fullName,
        email,
        phone: phone || undefined,
        address: address || undefined,
        departmentId: dept === "none" ? null : dept,
        designationId: desig === "none" ? null : desig,
        joinDate,
        basicSalary: Number(salary),
        gender: gender === "none" ? undefined : gender,
      },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCreated({ name: fullName, email, tempPassword: result.tempPassword });
    onCreated();
  }

  function resetAndClose() {
    setCode(""); setFullName(""); setEmail(""); setPhone(""); setAddress("");
    setDept("none"); setDesig("none"); setJoinDate(""); setSalary(""); setGender("none");
    setCreated(null);
    onOpenChange(false);
  }

  const deptFiltered = desig === "none"
    ? designations
    : designations.filter((d) => !d.department_id || d.department_id === dept);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : resetAndClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Employee registered</DialogTitle>
              <DialogDescription>
                {created.name} ({created.email}) can now sign in. Show this temporary password once — it must be
                changed at first sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted p-3 text-center font-mono text-lg tracking-wider">
              {created.tempPassword}
            </div>
            <DialogFooter>
              <Button onClick={resetAndClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Register employee</DialogTitle>
              <DialogDescription>
                A login with a temporary password is created automatically (Gross = 1.5 × Basic).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="emp-code">Employee code</Label>
                <Input id="emp-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="EMP-002" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-name">Full name</Label>
                <Input id="emp-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-email">Email (login)</Label>
                <Input id="emp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-phone">Phone</Label>
                <Input id="emp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={dept} onValueChange={(v) => { setDept(v); setDesig("none"); }}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Designation</Label>
                <Select value={desig} onValueChange={setDesig}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {deptFiltered.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-join">Join date</Label>
                <Input id="emp-join" type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-salary">Basic salary (PKR)</Label>
                <Input id="emp-salary" type="number" min={1} value={salary} onChange={(e) => setSalary(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue placeholder="Prefer not to say" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Prefer not to say</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="emp-address">Address</Label>
                <Input id="emp-address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
              <Button
                onClick={submit}
                disabled={saving || code.trim() === "" || fullName.trim().length < 3 || email.trim() === "" || joinDate === "" || Number(salary) <= 0}
              >
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Register
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- HR login (Admin) ----------

function HrLoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  const createFn = useServerFn(createHrLogin);

  async function submit() {
    setSaving(true);
    const result = await createFn({ data: { fullName, email } });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCreated({ email, tempPassword: result.tempPassword });
  }

  function resetAndClose() {
    setFullName(""); setEmail(""); setCreated(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : resetAndClose())}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>HR login created</DialogTitle>
              <DialogDescription>Share this temporary password with {created.email} — it must be changed at first sign-in.</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted p-3 text-center font-mono text-lg tracking-wider">{created.tempPassword}</div>
            <DialogFooter><Button onClick={resetAndClose}>Done</Button></DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create HR login</DialogTitle>
              <DialogDescription>HR can manage employees, attendance and leave.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="hr-name">Full name</Label>
                <Input id="hr-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-email">Email</Label>
                <Input id="hr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
              <Button onClick={submit} disabled={saving || fullName.trim().length < 3 || email.trim() === ""}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Create
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- CSV import ----------

function CsvImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [report, setReport] = useState<Awaited<ReturnType<typeof dryRunHelper>> | null>(null);
  const [running, setRunning] = useState(false);
  const [tempPasswords, setTempPasswords] = useState<Array<{ fullName: string; email: string; tempPassword: string }> | null>(null);

  const dryRunFn = useServerFn(csvDryRun);
  const importFn = useServerFn(csvImport);

  async function dryRunHelper(parsed: Record<string, string>[]) {
    return dryRunFn({ data: { rows: parsed } });
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      toast.error("No rows found in the file");
      return;
    }
    setRows(parsed);
    setRunning(true);
    const result = await dryRunHelper(parsed);
    setRunning(false);
    setReport(result.ok ? result : null);
    if (!result.ok) toast.error(result.error);
  }

  async function doImport() {
    if (!rows) return;
    setRunning(true);
    const result = await importFn({ data: { rows } });
    setRunning(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${result.created} employee(s) imported, ${result.skipped} skipped`);
    setTempPasswords(result.tempPasswords ?? []);
    setReport(null);
    setRows(null);
    if (fileRef.current) fileRef.current.value = "";
    onImported();
  }

  function resetAndClose() {
    setRows(null); setReport(null); setTempPasswords(null);
    if (fileRef.current) fileRef.current.value = "";
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : resetAndClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {tempPasswords ? (
          <>
            <DialogHeader>
              <DialogTitle>Import complete</DialogTitle>
              <DialogDescription>Temporary passwords for the imported employees — share each one now, they are shown only once.</DialogDescription>
            </DialogHeader>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Temporary password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tempPasswords.map((t) => (
                    <TableRow key={t.email}>
                      <TableCell>{t.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{t.email}</TableCell>
                      <TableCell className="font-mono text-xs">{t.tempPassword}</TableCell>
                    </TableRow>
                  ))}
                  {tempPasswords.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-muted-foreground">No employees were imported.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DialogFooter><Button onClick={resetAndClose}>Done</Button></DialogFooter>
          </>
        ) : report ? (
          <>
            <DialogHeader>
              <DialogTitle>Dry-run report</DialogTitle>
              <DialogDescription>
                {report.total} row(s) · {report.validCount} valid · {report.errorCount} with problems. Only valid rows will be imported.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Problems</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => (
                    <TableRow key={r.row}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell>{r.name || "—"}<div className="text-xs text-muted-foreground">{r.email}</div></TableCell>
                      <TableCell>
                        {r.errors.length === 0 ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">OK</Badge>
                        ) : (
                          <ul className="list-disc pl-4 text-xs text-destructive">
                            {r.errors.map((e, i) => <li key={i}><b>{e.field}</b>: {e.reason}</li>)}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setReport(null); setRows(null); if (fileRef.current) fileRef.current.value = ""; }}>
                Choose another file
              </Button>
              <Button onClick={doImport} disabled={running || report.validCount === 0}>
                {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Import {report.validCount} valid row(s)
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Import employees from CSV</DialogTitle>
              <DialogDescription>
                Required columns: employee_code, full_name, email, join_date (YYYY-MM-DD), basic_salary. Optional:
                phone, address, department, designation, gender. A dry-run report runs first.
              </DialogDescription>
            </DialogHeader>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {running && <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating…</div>}
            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
