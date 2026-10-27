create table public.workspace_licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null unique,
  plan_type text not null check (plan_type in ('monthly_30d', 'lifetime', 'trial')),
  status text not null default 'unclaimed' check (status in ('unclaimed', 'active', 'expired', 'revoked')),
  company_id uuid references public.companies(id) on delete set null,
  assigned_email text,
  assigned_company_name text,
  max_devices integer not null default 1,
  bound_device_hash text,
  bound_device_info text,
  last_active_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index workspace_licenses_company_id_idx on public.workspace_licenses (company_id);
create index workspace_licenses_status_idx on public.workspace_licenses (status);

-- Owner-only table: every access flows through privileged server functions
-- that verify the platform owner (or the owner master PIN), so no Data API
-- grants are issued to anon/authenticated by design.
alter table public.workspace_licenses enable row level security;

grant all on public.workspace_licenses to service_role;