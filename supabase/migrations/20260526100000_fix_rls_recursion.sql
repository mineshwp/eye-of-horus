-- Fix infinite recursion in RLS policies.
-- The profiles_select_admin policy queried public.profiles from within a
-- profiles policy, causing Postgres to recurse indefinitely.
-- Solution: a SECURITY DEFINER function that reads role without triggering RLS.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── profiles ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin')
);

-- ─── clients ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clients_modify_admin" ON public.clients;
CREATE POLICY "clients_modify_admin" ON public.clients FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin')
);

-- ─── client_users ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cu_admin" ON public.client_users;
CREATE POLICY "cu_admin" ON public.client_users FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin')
);

-- ─── access_requests ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ar_admin_select" ON public.access_requests;
DROP POLICY IF EXISTS "ar_admin_update" ON public.access_requests;
CREATE POLICY "ar_admin_select" ON public.access_requests FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin')
);
CREATE POLICY "ar_admin_update" ON public.access_requests FOR UPDATE USING (
    public.get_my_role() IN ('super_admin', 'admin')
);
