-- Replace tautological USING (true) SELECT policies on shared reference tables
-- with a real predicate: the caller must hold at least one app role in user_roles.

CREATE OR REPLACE FUNCTION public.has_any_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_any_role() TO authenticated;

DROP POLICY IF EXISTS "Authenticated can view company" ON public.companies;
CREATE POLICY "App users can view company"
  ON public.companies FOR SELECT TO authenticated
  USING (public.has_any_role());

DROP POLICY IF EXISTS "Authenticated can view departments" ON public.departments;
CREATE POLICY "App users can view departments"
  ON public.departments FOR SELECT TO authenticated
  USING (public.has_any_role());

DROP POLICY IF EXISTS "Authenticated can view designations" ON public.designations;
CREATE POLICY "App users can view designations"
  ON public.designations FOR SELECT TO authenticated
  USING (public.has_any_role());

DROP POLICY IF EXISTS "Authenticated can view leave types" ON public.leave_types;
CREATE POLICY "App users can view leave types"
  ON public.leave_types FOR SELECT TO authenticated
  USING (public.has_any_role());

DROP POLICY IF EXISTS "Authenticated can view holidays" ON public.public_holidays;
CREATE POLICY "App users can view holidays"
  ON public.public_holidays FOR SELECT TO authenticated
  USING (public.has_any_role());

DROP POLICY IF EXISTS "Authenticated view announcements" ON public.announcements;
CREATE POLICY "App users can view announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (public.has_any_role());

COMMENT ON FUNCTION public.has_any_role() IS 'True when the calling auth user holds at least one row in public.user_roles (admin, hr or employee).';