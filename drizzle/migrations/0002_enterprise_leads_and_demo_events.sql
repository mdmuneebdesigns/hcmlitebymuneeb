-- Commercial monetization Phase 1: lead capture + demo analytics

CREATE TABLE public.enterprise_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  company_name text not null,
  team_size text,
  inquiry_type text not null default 'Book a Live Product Demo',
  selected_plan text,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

GRANT INSERT ON public.enterprise_leads TO anon;
GRANT ALL ON public.enterprise_leads TO service_role;

ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors may only submit a lead; nobody but service_role reads them.
CREATE POLICY "Public can submit enterprise leads"
  ON public.enterprise_leads FOR INSERT TO anon WITH CHECK (true);

CREATE TABLE public.demo_events (
  id uuid primary key default gen_random_uuid(),
  demo_id text not null,
  action text not null,
  created_at timestamptz not null default now()
);

GRANT INSERT ON public.demo_events TO anon;
GRANT ALL ON public.demo_events TO service_role;

ALTER TABLE public.demo_events ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors may log their own demo usage; no reads, no updates.
CREATE POLICY "Public can log demo events"
  ON public.demo_events FOR INSERT TO anon WITH CHECK (true);
