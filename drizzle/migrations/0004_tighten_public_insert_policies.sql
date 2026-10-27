-- Harden anon INSERT policies: replace tautological WITH CHECK (true) with real row predicates.
-- Super-admin-only read path added on enterprise_leads (defense in depth; app reads via service-role).

-- Helper: super admin = the owner account (checked from the verified JWT email, never from client-editable data).
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', '') = 'mdmuneebdesigns@gmail.com'
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- 1) enterprise_leads: anyone may SUBMIT a lead, but only rows shaped like the booking form pass;
--    nobody can read/modify leads (owner console goes through service-role + new owner-email SELECT policy).
DROP POLICY "Public can submit enterprise leads" ON public.enterprise_leads;
CREATE POLICY "Public can submit enterprise leads" ON public.enterprise_leads
FOR INSERT TO anon, authenticated
WITH CHECK (
  length(trim(full_name))    BETWEEN 2 AND 120
  AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND length(email) <= 200
  AND length(trim(phone))    BETWEEN 7 AND 30
  AND length(trim(company_name)) BETWEEN 2 AND 200
  AND (team_size IS NULL OR team_size IN (
        '1–25 Employees', '26–100 Employees', '101–500 Employees', '500+ Enterprise',
        'Custom White-Label / Source Code License'))
  AND inquiry_type IN (
        'Book a Live Product Demo', 'Purchase SaaS Subscription',
        'Purchase Monthly Subscription ($49/month)', 'Purchase Lifetime License ($499 one-time)',
        'Custom On-Premise / Cloud Deployment', 'White-Label Source Code Acquisition',
        'License Key Activation', 'AI / Computer Vision Integration Consultation')
  AND (selected_plan IS NULL OR selected_plan IN (
        'Interactive Demo Trial', 'Monthly Cloud Subscription', 'Lifetime Enterprise License'))
  AND length(trim(message)) BETWEEN 5 AND 4000
  AND status = 'new'
);

CREATE POLICY "Super admin can view enterprise leads" ON public.enterprise_leads
FOR SELECT TO authenticated USING (public.is_super_admin());

-- 2) demo_events: anonymous demo telemetry — only the app's five module keys and sane ids pass.
DROP POLICY "Public can log demo events" ON public.demo_events;
CREATE POLICY "Public can log demo events" ON public.demo_events
FOR INSERT TO anon, authenticated
WITH CHECK (
  demo_id <> '' AND length(demo_id) <= 64
  AND action IN ('employees', 'checkins', 'leaves', 'receipts', 'ai')
);