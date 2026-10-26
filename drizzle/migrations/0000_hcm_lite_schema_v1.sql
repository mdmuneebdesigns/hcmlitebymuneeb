-- ============ HCM Lite schema (v1) ============

create type public.app_role as enum ('admin', 'hr', 'employee');

-- Roles live in their own table (never on profiles)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

create policy "Users can view own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "Admins can manage user roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Company + org settings (single company instance, created by first-run wizard)
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  office_start time not null default '09:00',
  grace_minutes int not null default 15,
  half_day_hours numeric not null default 5,
  weekend_days text[] not null default '{Saturday,Sunday}',
  office_lat double precision not null default 0,
  office_lng double precision not null default 0,
  geofence_radius_m int not null default 150,
  late_penalty_lates int not null default 3,
  late_penalty_days numeric not null default 0.5,
  setup_complete boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.companies to authenticated;
grant all on public.companies to service_role;
alter table public.companies enable row level security;
create policy "Authenticated can view company" on public.companies for select to authenticated using (true);
create policy "Admins can update company" on public.companies for update to authenticated using (public.has_role(auth.uid(), 'admin'));

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table public.designations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  department_id uuid references public.departments(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  annual_quota numeric not null default 0,
  is_paid boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  created_at timestamptz not null default now()
);
grant select on public.departments to authenticated;
grant select on public.designations to authenticated;
grant select on public.leave_types to authenticated;
grant select on public.public_holidays to authenticated;
grant all on public.departments to service_role;
grant all on public.designations to service_role;
grant all on public.leave_types to service_role;
grant all on public.public_holidays to service_role;
alter table public.departments enable row level security;
alter table public.designations enable row level security;
alter table public.leave_types enable row level security;
alter table public.public_holidays enable row level security;
create policy "Authenticated can view departments" on public.departments for select to authenticated using (true);
create policy "Admins manage departments" on public.departments for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Authenticated can view designations" on public.designations for select to authenticated using (true);
create policy "Admins manage designations" on public.designations for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Authenticated can view leave types" on public.leave_types for select to authenticated using (true);
create policy "Admins manage leave types" on public.leave_types for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Authenticated can view holidays" on public.public_holidays for select to authenticated using (true);
create policy "Admins manage holidays" on public.public_holidays for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Employees (user_id is a plain uuid linking to the auth account)
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  employee_code text not null unique,
  full_name text not null,
  email text not null unique,
  phone text,
  address text,
  department_id uuid references public.departments(id) on delete set null,
  designation_id uuid references public.designations(id) on delete set null,
  join_date date not null,
  exit_date date,
  status text not null default 'active' check (status in ('active','probation','exited')),
  basic_salary numeric(12,2) not null check (basic_salary > 0),
  gender text,
  must_change_password boolean not null default false,
  face_descriptor jsonb,
  created_at timestamptz not null default now()
);
create index employees_department_idx on public.employees(department_id);
grant select on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;
create policy "Own employee record or HR/Admin" on public.employees for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'hr') or public.has_role(auth.uid(), 'admin'));

-- Attendance: one record per employee per day; server stamps times via service role
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status text not null default 'present' check (status in ('present','late','half_day','absent','missing_checkout','on_leave')),
  check_in_lat double precision,
  check_in_lng double precision,
  check_in_accuracy_m numeric,
  distance_m numeric,
  check_out_lat double precision,
  check_out_lng double precision,
  check_out_accuracy_m numeric,
  check_method text not null default 'web' check (check_method in ('web','camera','webcam','gps','webcam+gps')),
  face_ok boolean,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index attendance_date_idx on public.attendance(work_date);
grant select on public.attendance to authenticated;
grant all on public.attendance to service_role;
alter table public.attendance enable row level security;
create policy "Own attendance or HR/Admin" on public.attendance for select to authenticated
  using (exists (select 1 from public.employees e where e.id = attendance.employee_id and e.user_id = auth.uid())
         or public.has_role(auth.uid(), 'hr') or public.has_role(auth.uid(), 'admin'));

-- Attendance corrections
create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  field text not null check (field in ('check_in','check_out')),
  requested_time timestamptz not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid,
  decision_comment text,
  created_at timestamptz not null default now()
);
grant select on public.attendance_corrections to authenticated;
grant all on public.attendance_corrections to service_role;
alter table public.attendance_corrections enable row level security;
create policy "Own corrections or HR/Admin" on public.attendance_corrections for select to authenticated
  using (exists (select 1 from public.employees e where e.id = attendance_corrections.employee_id and e.user_id = auth.uid())
         or public.has_role(auth.uid(), 'hr') or public.has_role(auth.uid(), 'admin'));

-- Leave requests
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  start_date date not null,
  end_date date not null,
  working_days numeric(4,1) not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid,
  decision_comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index leave_requests_employee_idx on public.leave_requests(employee_id);
grant select on public.leave_requests to authenticated;
grant all on public.leave_requests to service_role;
alter table public.leave_requests enable row level security;
create policy "Own leaves or HR/Admin" on public.leave_requests for select to authenticated
  using (exists (select 1 from public.employees e where e.id = leave_requests.employee_id and e.user_id = auth.uid())
         or public.has_role(auth.uid(), 'hr') or public.has_role(auth.uid(), 'admin'));

-- Payroll
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  status text not null default 'draft' check (status in ('draft','finalized')),
  working_days numeric(4,1) not null,
  total_gross numeric(14,2) not null default 0,
  total_net numeric(14,2) not null default 0,
  created_by uuid,
  finalized_by uuid,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (period_month, period_year)
);
create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  basic_salary numeric(12,2) not null,
  gross_salary numeric(12,2) not null,
  per_day_rate numeric(12,2) not null,
  working_days numeric(4,1) not null,
  present_days numeric(4,1) not null default 0,
  half_days numeric(4,1) not null default 0,
  absent_days numeric(4,1) not null default 0,
  unpaid_leave_days numeric(4,1) not null default 0,
  lates int not null default 0,
  late_deduction numeric(12,2) not null default 0,
  absence_deduction numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null,
  unique (run_id, employee_id)
);
grant select on public.payroll_runs to authenticated;
grant select on public.payslips to authenticated;
grant all on public.payroll_runs to service_role;
grant all on public.payslips to service_role;
alter table public.payroll_runs enable row level security;
alter table public.payslips enable row level security;
create policy "HR/Admin view payroll runs" on public.payroll_runs for select to authenticated
  using (public.has_role(auth.uid(), 'hr') or public.has_role(auth.uid(), 'admin'));
create policy "Own payslips or HR/Admin" on public.payslips for select to authenticated
  using (exists (select 1 from public.employees e where e.id = payslips.employee_id and e.user_id = auth.uid())
         or public.has_role(auth.uid(), 'hr') or public.has_role(auth.uid(), 'admin'));

-- Comms & audit
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  posted_by uuid,
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null,
  entity text not null,
  entity_id text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);
create table public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  feature text not null,
  question text,
  answer text,
  tool_calls jsonb,
  latency_ms int,
  success boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.announcements to authenticated;
grant select on public.notifications to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.ai_logs to authenticated;
grant all on public.announcements to service_role;
grant all on public.notifications to service_role;
grant all on public.audit_logs to service_role;
grant all on public.ai_logs to service_role;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_logs enable row level security;
create policy "Authenticated view announcements" on public.announcements for select to authenticated using (true);
create policy "Own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "Admin views audit log" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admin views ai logs" on public.ai_logs for select to authenticated using (public.has_role(auth.uid(), 'admin'));
