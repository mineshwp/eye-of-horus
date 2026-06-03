-- Tighten the reports SELECT policy (review follow-up).
--
-- The previous reports_select policy (20260528200000) granted read access when
-- `auth.uid() IS NULL` — intended for service-role/server access, but an
-- unauthenticated browser using the public anon key also has a NULL auth.uid(),
-- so it could read ALL reports. The service role bypasses RLS entirely, so that
-- clause is unnecessary and is removed here.
--
-- After this:
--   • Staff (super_admin / admin) → read all reports
--   • Clients                     → read only their own approved reports
--   • anon (no session)           → nothing
--   • service_role                → bypasses RLS (public report link via the
--                                   /api/reports/share server route is unaffected)

DROP POLICY IF EXISTS "reports_select" ON public.reports;

CREATE POLICY "reports_select" ON public.reports
  FOR SELECT
  USING (
    public.get_my_role() IN ('super_admin', 'admin')
    OR (
      status = 'approved'
      AND client_id IN (
        SELECT client_id FROM public.client_users WHERE user_id = auth.uid()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (restores the previous, looser policy):
--   DROP POLICY IF EXISTS "reports_select" ON public.reports;
--   CREATE POLICY "reports_select" ON public.reports FOR SELECT USING (
--     auth.uid() IS NULL
--     OR (SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('super_admin','admin')
--     OR (status = 'approved' AND client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()))
--   );
-- ─────────────────────────────────────────────────────────────────────────────
