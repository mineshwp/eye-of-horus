-- RLS lockdown for the core operational tables (review finding #2).
--
-- Replaces the public `USING (true)` CRUD policies on sites / issues /
-- wp_updates / activities (from 20260522000000_init_schema.sql) with
-- role-gated access:
--   • Staff (super_admin / admin)  → full read + write
--   • Clients                      → read-only on the sites tied to their
--                                    approved reports (portal); no read on
--                                    issues / wp_updates / activities
--   • anon (no session)            → nothing
--   • service_role                 → bypasses RLS entirely (unchanged)
--
-- The agency dashboard reads/writes these tables through the authenticated
-- anon client; staff sessions satisfy the staff policy, so no app code changes.
-- All server routes (crons, WordPress sync, checks/run, report generation) use
-- the SERVICE ROLE key, which bypasses RLS — they are unaffected.
--
-- PREREQUISITE: SUPABASE_SERVICE_ROLE_KEY must be set in every server
-- environment (Vercel etc.). Routes that fall back to the anon key when it is
-- missing will be denied by these policies.
--
-- Uses public.get_my_role() (SECURITY DEFINER, from 20260526100000) which reads
-- the caller's role without recursing through RLS.

-- ── Drop the public USING(true) policies ─────────────────────────────────────
DROP POLICY IF EXISTS "Allow public select on sites"  ON public.sites;
DROP POLICY IF EXISTS "Allow public insert on sites"  ON public.sites;
DROP POLICY IF EXISTS "Allow public update on sites"  ON public.sites;
DROP POLICY IF EXISTS "Allow public delete on sites"  ON public.sites;

DROP POLICY IF EXISTS "Allow public select on issues" ON public.issues;
DROP POLICY IF EXISTS "Allow public insert on issues" ON public.issues;
DROP POLICY IF EXISTS "Allow public update on issues" ON public.issues;
DROP POLICY IF EXISTS "Allow public delete on issues" ON public.issues;

DROP POLICY IF EXISTS "Allow public select on wp_updates" ON public.wp_updates;
DROP POLICY IF EXISTS "Allow public insert on wp_updates" ON public.wp_updates;
DROP POLICY IF EXISTS "Allow public update on wp_updates" ON public.wp_updates;
DROP POLICY IF EXISTS "Allow public delete on wp_updates" ON public.wp_updates;

DROP POLICY IF EXISTS "Allow public select on activities" ON public.activities;
DROP POLICY IF EXISTS "Allow public insert on activities" ON public.activities;
DROP POLICY IF EXISTS "Allow public update on activities" ON public.activities;
DROP POLICY IF EXISTS "Allow public delete on activities" ON public.activities;

-- ── Staff: full access (read + write) ────────────────────────────────────────
DROP POLICY IF EXISTS "sites_staff_all" ON public.sites;
CREATE POLICY "sites_staff_all" ON public.sites FOR ALL TO authenticated
  USING (public.get_my_role() IN ('super_admin','admin'))
  WITH CHECK (public.get_my_role() IN ('super_admin','admin'));

DROP POLICY IF EXISTS "issues_staff_all" ON public.issues;
CREATE POLICY "issues_staff_all" ON public.issues FOR ALL TO authenticated
  USING (public.get_my_role() IN ('super_admin','admin'))
  WITH CHECK (public.get_my_role() IN ('super_admin','admin'));

DROP POLICY IF EXISTS "wp_updates_staff_all" ON public.wp_updates;
CREATE POLICY "wp_updates_staff_all" ON public.wp_updates FOR ALL TO authenticated
  USING (public.get_my_role() IN ('super_admin','admin'))
  WITH CHECK (public.get_my_role() IN ('super_admin','admin'));

DROP POLICY IF EXISTS "activities_staff_all" ON public.activities;
CREATE POLICY "activities_staff_all" ON public.activities FOR ALL TO authenticated
  USING (public.get_my_role() IN ('super_admin','admin'))
  WITH CHECK (public.get_my_role() IN ('super_admin','admin'));

-- ── Clients: read-only on sites referenced by their approved reports ─────────
-- sites has no client_id column; the client↔site link is via reports.
DROP POLICY IF EXISTS "sites_client_select" ON public.sites;
CREATE POLICY "sites_client_select" ON public.sites FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT r.site_id
      FROM public.reports r
      WHERE r.status = 'approved'
        AND r.client_id IN (
          SELECT cu.client_id FROM public.client_users cu WHERE cu.user_id = auth.uid()
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run manually to restore the previous public access if needed):
--
--   DROP POLICY IF EXISTS "sites_staff_all"      ON public.sites;
--   DROP POLICY IF EXISTS "sites_client_select"  ON public.sites;
--   DROP POLICY IF EXISTS "issues_staff_all"     ON public.issues;
--   DROP POLICY IF EXISTS "wp_updates_staff_all" ON public.wp_updates;
--   DROP POLICY IF EXISTS "activities_staff_all" ON public.activities;
--   CREATE POLICY "Allow public select on sites" ON public.sites FOR SELECT USING (true);
--   -- …re-create the other 15 public policies from 20260522000000_init_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────
