# RLS Hardening Plan (Issue #2)

**Status:** Proposed — not yet implemented. Do not apply piecemeal; the data-access
refactor and the policy migration must ship together (see Deploy Ordering).

## Problem

`supabase/migrations/20260522000000_init_schema.sql` (lines 70–88) grants public
`SELECT/INSERT/UPDATE/DELETE USING (true)` on `sites`, `issues`, `wp_updates`,
`activities`. The browser uses the **anon** Supabase client (`lib/supabase.ts`)
and reads/writes those tables directly. Anyone with the public anon key (shipped
to every browser) can read and write all agency + client data at the DB layer,
bypassing app auth entirely.

This violates the CLAUDE.md rules: "Use Supabase RLS everywhere", "Keep all
systems multi-tenant", "Clients only see their own company data".

## Why it isn't a one-line fix

The anon client is the app's primary data layer. Replacing the public policies
without reworking these call sites would break the live app:

| File | Tables (read R / write W) |
|------|---------------------------|
| `context/AppContext.tsx` | `sites` R/W, `issues` R/W, `wp_updates` R, `activities` R/W, `profiles` R |
| `app/(dashboard)/admin/clients/page.tsx` | `clients` R/W, `sites` R/W, `activities` W, `access_requests` R/W |
| `app/(dashboard)/sites/[id]/page.tsx` | `uptime_checks`, `domain_checks`, `performance_metrics`, `playwright_checks`, `form_checks`, `seo_audits`, `broken_links`, `wordpress_snapshots` (R) |
| `app/(portal)/portal/reports/page.tsx` | `profiles` R, `client_users` R, `reports` R, `sites` R |
| `app/(portal)/portal/login/page.tsx`, `app/(dashboard)/issues/[id]/page.tsx` | `profiles` R |
| `app/request-access/page.tsx` | `access_requests` W (intentionally public — anonymous request form) |

Newer tables (`rum_*`, `wordpress_snapshots`) already use the correct pattern:
`authenticated` read + `service_role` all. That's the target model.

## Target Model

Two access classes:

1. **Agency staff (admin/super_admin):** full read/write to operational tables.
   Enforced by RLS that checks the caller's `profiles.role`.
2. **Clients:** read-only, scoped to their own company via `client_users`.
   Already partially modelled in the portal.

Anonymous (no session) gets **nothing**, except the deliberate public surfaces:
`access_requests` INSERT (request-access form) and the public report link, which
already goes through a **server** route (`/api/reports/share/[token]`) using the
service role — not the anon client.

### Decision: RLS-on-anon-client vs. server API routes

Two viable approaches; recommend a hybrid:

- **Reads** → keep on the authenticated anon client, but replace `USING (true)`
  with policies that require a session and (for clients) tenant scoping. Lowest
  churn; the browser already holds a Supabase session after login.
- **Writes** (`INSERT/UPDATE/DELETE`) → move to **server API routes** using the
  service role + `getApiUser` + role check. Removes write trust from the browser
  entirely and centralises audit logging. Affects `AppContext` (issue status
  updates, activity inserts, site updates) and `admin/clients` (client/site
  creation).

## Helper: role lookup in SQL

```sql
CREATE OR REPLACE FUNCTION public.current_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.current_role() IN ('admin','super_admin')
$$;
```

## Policy migration (sketch — replaces the public policies)

```sql
-- Drop the public policies
DROP POLICY IF EXISTS "Allow public select on sites"  ON public.sites;
-- … (all 16 public policies on sites/issues/wp_updates/activities)

-- Staff: full access (reads via anon client w/ session; writes via service role).
CREATE POLICY "staff_read_sites"  ON public.sites FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "service_all_sites" ON public.sites FOR ALL    TO service_role  USING (true) WITH CHECK (true);
-- Clients: read only their own sites.
CREATE POLICY "client_read_sites" ON public.sites FOR SELECT TO authenticated
  USING (id IN (
    SELECT cu.site_id FROM public.client_users cu WHERE cu.user_id = auth.uid()
  ));
-- repeat the pattern for issues / wp_updates / activities, scoping client rows by site_id
```

(Note: `client_users` currently links users to `client_id`; confirm whether
client→site mapping is via `clients.id` or `sites.id` and scope accordingly.)

## Code changes required

1. **New API routes** (service role + `getApiUser` + `is_staff` check):
   - `POST /api/issues/[id]/status` — replaces `AppContext` issue UPDATE.
   - `POST /api/activities` — replaces direct `activities` INSERT (AppContext + admin/clients).
   - `POST /api/admin/clients` — replaces `clients`/`sites` INSERT in admin/clients page.
   - `POST /api/sites/[id]` (update) — replaces AppContext site UPDATE.
2. **AppContext / admin pages:** swap direct `supabase.from(...).insert/update`
   for `apiFetch` to the new routes.
3. **Keep** the authenticated reads on the anon client (policies now enforce them).
4. Leave `access_requests` INSERT public (anonymous form) — explicit policy.

## Deploy Ordering (critical)

1. Ship the **new API routes** first (additive, no behaviour change).
2. Ship the **client code** that uses them (writes now go server-side; reads unchanged).
3. **Only then** apply the **policy migration**. Applying it before steps 1–2 will
   break every browser write and any unauthenticated read.

## Rollback

The migration's down-path re-creates the `USING (true)` policies. Keep it ready;
if a read/write surface was missed, the app fails closed (permission denied) and
the symptom points straight at the table.

## Verification checklist

- [ ] Logged-out user: cannot read `sites`/`issues` via anon client (network tab 401/empty).
- [ ] Client user: sees only their own company's sites/reports.
- [ ] Staff user: full dashboard works (reads + the new write routes).
- [ ] `access_requests`: anonymous request form still submits.
- [ ] Public report link (`/report/[token]`) still resolves (server route, unaffected).
