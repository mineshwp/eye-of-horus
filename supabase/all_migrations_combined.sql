-- Eye of Horus — Combined Idempotent Migrations
-- Generated: 2026-05-26T09:52:01.299Z
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Safe to run multiple times — DROP POLICY IF EXISTS guards prevent duplicates.

-- ============================================================
-- 20260522000000_init_schema.sql
-- ============================================================

-- Create sites table
CREATE TABLE IF NOT EXISTS public.sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    initials TEXT NOT NULL,
    brand TEXT NOT NULL,
    health INTEGER NOT NULL,
    status TEXT NOT NULL,
    uptime NUMERIC NOT NULL,
    perf INTEGER NOT NULL,
    sec INTEGER NOT NULL,
    open_issues INTEGER NOT NULL,
    wp_core TEXT NOT NULL,
    wp_core_latest TEXT NOT NULL,
    wp_plugins INTEGER NOT NULL,
    wp_themes INTEGER NOT NULL,
    forms TEXT NOT NULL,
    last_scan TEXT NOT NULL
);

-- Create issues table
CREATE TABLE IF NOT EXISTS public.issues (
    id TEXT PRIMARY KEY,
    site_id TEXT REFERENCES public.sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    impact TEXT NOT NULL,
    category TEXT NOT NULL,
    page TEXT NOT NULL,
    recommended TEXT NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL,
    detected TEXT NOT NULL,
    change_type TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    evidence JSONB
);

-- Create wp_updates table
CREATE TABLE IF NOT EXISTS public.wp_updates (
    id TEXT PRIMARY KEY,
    site_id TEXT REFERENCES public.sites(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    risk TEXT NOT NULL,
    priority TEXT NOT NULL,
    notes TEXT NOT NULL,
    flag TEXT NOT NULL
);

-- Create activities table
CREATE TABLE IF NOT EXISTS public.activities (
    id SERIAL PRIMARY KEY,
    time TEXT NOT NULL,
    site_name TEXT NOT NULL,
    text TEXT NOT NULL,
    sev TEXT NOT NULL,
    type TEXT NOT NULL
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Create public read/write access policies (since this is a single-tenant admin console for the agency)
DROP POLICY IF EXISTS "Allow public select on sites" ON public.sites;
CREATE POLICY "Allow public select on sites" ON public.sites FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert on sites" ON public.sites;
CREATE POLICY "Allow public insert on sites" ON public.sites FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update on sites" ON public.sites;
CREATE POLICY "Allow public update on sites" ON public.sites FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete on sites" ON public.sites;
CREATE POLICY "Allow public delete on sites" ON public.sites FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select on issues" ON public.issues;
CREATE POLICY "Allow public select on issues" ON public.issues FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert on issues" ON public.issues;
CREATE POLICY "Allow public insert on issues" ON public.issues FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update on issues" ON public.issues;
CREATE POLICY "Allow public update on issues" ON public.issues FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete on issues" ON public.issues;
CREATE POLICY "Allow public delete on issues" ON public.issues FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select on wp_updates" ON public.wp_updates;
CREATE POLICY "Allow public select on wp_updates" ON public.wp_updates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert on wp_updates" ON public.wp_updates;
CREATE POLICY "Allow public insert on wp_updates" ON public.wp_updates FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update on wp_updates" ON public.wp_updates;
CREATE POLICY "Allow public update on wp_updates" ON public.wp_updates FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete on wp_updates" ON public.wp_updates;
CREATE POLICY "Allow public delete on wp_updates" ON public.wp_updates FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select on activities" ON public.activities;
CREATE POLICY "Allow public select on activities" ON public.activities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert on activities" ON public.activities;
CREATE POLICY "Allow public insert on activities" ON public.activities FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update on activities" ON public.activities;
CREATE POLICY "Allow public update on activities" ON public.activities FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete on activities" ON public.activities;
CREATE POLICY "Allow public delete on activities" ON public.activities FOR DELETE USING (true);

-- Clear existing seed data if any
DELETE FROM public.wp_updates;
DELETE FROM public.issues;
DELETE FROM public.sites;
DELETE FROM public.activities;

-- Seed data for sites
INSERT INTO public.sites (id, name, url, initials, brand, health, status, uptime, perf, sec, open_issues, wp_core, wp_core_latest, wp_plugins, wp_themes, forms, last_scan) VALUES
('acme', 'Acme Finance', 'acmefinance.co.za', 'AF', '#3B82F6', 64, 'critical', 99.96, 72, 86, 4, '6.5.2', '6.6.1', 6, 1, 'issue', '12 min ago'),
('greenfield', 'Greenfield Estates', 'greenfieldestates.com', 'GE', '#22C55E', 88, 'attention', 99.99, 84, 92, 2, '6.6.1', '6.6.1', 3, 0, 'ok', '8 min ago'),
('nova', 'Nova Legal', 'novalegal.law', 'NL', '#8B5CF6', 94, 'healthy', 100.0, 91, 96, 0, '6.6.1', '6.6.1', 1, 0, 'ok', '5 min ago'),
('flexcom', 'Flexcom Recruitment', 'flexcom.jobs', 'FX', '#F59E0B', 79, 'attention', 99.92, 76, 88, 3, '6.5.5', '6.6.1', 4, 1, 'ok', '21 min ago'),
('gentech', 'Gentech Industries', 'gentech.io', 'GT', '#00E5FF', 71, 'attention', 99.84, 68, 79, 5, '6.4.3', '6.6.1', 8, 2, 'ok', '1 hr ago'),
('tarsus', 'Tarsus Cloud Portal', 'portal.tarsuscloud.com', 'TC', '#EF4444', 58, 'critical', 99.41, 62, 71, 7, '6.5.1', '6.6.1', 11, 1, 'issue', '3 min ago'),
('wetpaint', 'Wetpaint Corporate', 'wetpaint.co.za', 'WP', '#D9A05B', 96, 'healthy', 100.0, 94, 98, 0, '6.6.1', '6.6.1', 0, 0, 'ok', '2 min ago');

-- Seed data for issues
INSERT INTO public.issues (id, site_id, title, severity, impact, category, page, recommended, owner, status, detected, change_type, confidence, evidence) VALUES
('i1', 'acme', 'Homepage hero button missing on mobile', 'critical', 'Lead generation affected', 'Visual regression', '/', 'Restore primary CTA on viewports < 768px. Recent theme update overrode mobile visibility.', 'M. Patel', 'Investigating', 'Today, 09:14', 'Broken component', 96, '{"left": "12%", "top": "62%", "width": "32%", "height": "10%"}'),
('i2', 'tarsus', 'Contact form submissions failing', 'critical', 'Inbound leads not received', 'Form failure', '/contact-us', 'Endpoint /wp-admin/admin-ajax.php returning 500. Disable Form-Pro 4.2.1 update and rollback to 4.1.9.', 'J. Ndlovu', 'In Progress', 'Today, 06:42', 'Server error', 99, '{}'),
('i3', 'gentech', 'Plugin update pending with compatibility risk', 'high', 'WooCommerce checkout may break', 'WordPress update', 'wp-admin', 'Stage WooCommerce 9.0 update on staging before production. Test cart, checkout, payment hooks.', 'Unassigned', 'New', 'Yesterday, 18:22', 'Update risk', 88, '{}'),
('i4', 'acme', 'SSL certificate expires in 9 days', 'high', 'Browser warnings imminent', 'Security', '*.acmefinance.co.za', 'Renew Let''s Encrypt cert via host. Verify auto-renew cron is active.', 'S. Khumalo', 'New', 'Today, 04:00', 'Cert expiry', 100, '{}'),
('i5', 'flexcom', 'Unexpected homepage copy change', 'medium', 'Tone-of-voice drift', 'Content', '/', 'Hero subheading changed without ticket. Confirm with editor or revert.', 'M. Patel', 'New', 'Today, 11:02', 'Copy change', 92, '{}'),
('i6', 'acme', 'Layout shift detected on services page', 'medium', 'CLS regression, SEO risk', 'Performance', '/services', 'New embedded video lacks width/height. Add intrinsic dimensions to reserve space.', 'S. Khumalo', 'Investigating', 'Today, 10:48', 'Layout shift', 91, '{}'),
('i7', 'greenfield', 'Tracking script removed', 'medium', 'Conversion data gap', 'Tracking', 'global', 'GTM-XJ8FZP missing from <head>. Verify with marketing if intentional.', 'Unassigned', 'New', 'Today, 08:31', 'Tag change', 97, '{}'),
('i8', 'tarsus', 'JavaScript error spike on checkout page', 'high', 'Drop-off risk', 'JS error', '/checkout', 'Uncaught TypeError in cart.min.js line 412. 28 errors in last hour vs baseline of 2.', 'J. Ndlovu', 'In Progress', 'Today, 07:55', 'Broken component', 95, '{}'),
('i9', 'flexcom', 'Missing image on team page', 'low', 'Visual polish', 'Visual regression', '/about/team', 'Asset /uploads/2024/team-thandi.jpg returns 404. Re-upload or update reference.', 'Unassigned', 'New', 'Yesterday, 16:09', 'Missing image', 100, '{}'),
('i10', 'gentech', 'Security headers weakened', 'high', 'XSS exposure increased', 'Security', 'global', 'Content-Security-Policy ''unsafe-inline'' added in last deploy. Tighten and re-test.', 'S. Khumalo', 'New', 'Today, 02:15', 'Header change', 89, '{}');

-- Seed data for wp_updates
INSERT INTO public.wp_updates (id, site_id, target, "from", "to", risk, priority, notes, flag) VALUES
('w1', 'acme', 'WordPress Core', '6.5.2', '6.6.1', 'low', 'high', 'Security release. Safe to update.', 'Safe update'),
('w2', 'acme', 'WooCommerce', '8.9.2', '9.0.1', 'high', 'high', 'Major version. Custom checkout hooks present.', 'Needs staging test'),
('w3', 'gentech', 'Elementor Pro', '3.21.1', '3.22.0', 'medium', 'medium', 'Template overrides detected.', 'Needs staging test'),
('w4', 'gentech', 'Yoast SEO', '22.7', '22.9', 'low', 'low', 'Minor patch. Translation strings only.', 'Safe update'),
('w5', 'flexcom', 'Advanced Custom Fields', '6.3.0', '6.3.4', 'low', 'medium', 'Field group migration recommended.', 'Safe update'),
('w6', 'tarsus', 'Form-Pro', '4.1.9', '4.2.1', 'high', 'critical', 'Currently rolled back due to submission failures.', 'Do not update'),
('w7', 'tarsus', 'WordPress Core', '6.5.1', '6.6.1', 'medium', 'high', 'Two minor versions behind. Test admin custom workflows.', 'Needs staging test'),
('w8', 'flexcom', 'Astra Theme', '4.6.10', '4.7.2', 'low', 'low', 'No child theme conflicts detected.', 'Safe update');

-- Seed data for activities
INSERT INTO public.activities (time, site_name, text, sev, type) VALUES
('09:14', 'Acme Finance', 'Visual regression on /  · mobile hero CTA missing', 'crit', 'visual'),
('08:31', 'Greenfield Estates', 'Tracking script GTM-XJ8FZP removed from <head>', 'med', 'tag'),
('07:55', 'Tarsus Cloud Portal', 'JavaScript error rate ↑ 1400% on /checkout', 'high', 'js'),
('06:42', 'Tarsus Cloud Portal', 'Form submissions returning HTTP 500', 'crit', 'form'),
('04:00', 'Acme Finance', 'SSL certificate expires in 9 days', 'high', 'ssl'),
('02:15', 'Gentech Industries', 'Content-Security-Policy weakened in last deploy', 'high', 'sec'),
('Yesterday', 'Flexcom Recruitment', 'Missing image: /uploads/2024/team-thandi.jpg', 'low', 'asset'),
('Yesterday', 'Gentech Industries', 'WooCommerce 9.0 update available · compatibility risk', 'high', 'wp');


-- ============================================================
-- 20260523000000_phase1_extended.sql
-- ============================================================

-- Phase 1 Extended Schema
-- Adds: profiles, clients, client_users, access_requests
-- Run AFTER: 20260522000000_init_schema.sql

-- ─── profiles ───────────────────────────────────────────────────────────────
-- User profiles linked to Supabase Auth.
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'client')),
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_idx ON public.profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

-- ─── clients ────────────────────────────────────────────────────────────────
-- Agency clients. Each client can have one or more monitored sites.
-- Note: the existing "sites" table stores monitoring data per site.
-- Clients are the business entities that own those sites.
CREATE TABLE IF NOT EXISTS public.clients (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    website_url  TEXT NOT NULL,
    industry     TEXT,
    logo_url     TEXT,
    status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── client_users ───────────────────────────────────────────────────────────
-- Maps users to the clients they can access.
CREATE TABLE IF NOT EXISTS public.client_users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('manager', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(client_id, user_id)
);

-- ─── access_requests ────────────────────────────────────────────────────────
-- Access request submissions from the /request-access page.
CREATE TABLE IF NOT EXISTS public.access_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    company     TEXT NOT NULL,
    role        TEXT NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- profiles: users can read and update their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"   ON public.profiles FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"   ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
-- admins can read all profiles (uses a helper function below)
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);
DROP POLICY IF EXISTS "profiles_insert_system" ON public.profiles;
CREATE POLICY "profiles_insert_system" ON public.profiles FOR INSERT WITH CHECK (true);

-- clients: any authenticated user can select; only admins can modify
DROP POLICY IF EXISTS "clients_select_authed" ON public.clients;
CREATE POLICY "clients_select_authed"  ON public.clients FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "clients_modify_admin" ON public.clients;
CREATE POLICY "clients_modify_admin"   ON public.clients FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);

-- client_users: authenticated users can see their own assignments
DROP POLICY IF EXISTS "client_users_select_own" ON public.client_users;
CREATE POLICY "client_users_select_own" ON public.client_users FOR SELECT USING (auth.uid() = user_id);
-- admins can manage all assignments
DROP POLICY IF EXISTS "client_users_admin" ON public.client_users;
CREATE POLICY "client_users_admin"      ON public.client_users FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);

-- access_requests: anyone can insert (public form); only admins can read/update
DROP POLICY IF EXISTS "access_requests_insert_public" ON public.access_requests;
CREATE POLICY "access_requests_insert_public" ON public.access_requests FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "access_requests_admin" ON public.access_requests;
CREATE POLICY "access_requests_admin"         ON public.access_requests FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);
DROP POLICY IF EXISTS "access_requests_update_admin" ON public.access_requests;
CREATE POLICY "access_requests_update_admin"  ON public.access_requests FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);

-- ─── Seed sample clients ─────────────────────────────────────────────────────
-- These mirror the sites in the init migration.
INSERT INTO public.clients (name, website_url, industry, status) VALUES
    ('Acme Finance',        'https://acmefinance.co.za',        'Financial Services', 'active'),
    ('Greenfield Estates',  'https://greenfieldestates.com',    'Real Estate',        'active'),
    ('Nova Legal',          'https://novalegal.law',            'Legal Services',     'active'),
    ('Flexcom Recruitment', 'https://flexcom.jobs',             'Recruitment',        'active'),
    ('Gentech Industries',  'https://gentech.io',               'Technology',         'active'),
    ('Tarsus Cloud Portal', 'https://portal.tarsuscloud.com',   'Technology',         'active'),
    ('Wetpaint Corporate',  'https://wetpaint.co.za',           'Marketing Agency',   'active')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 20260523200000_phase2_monitoring.sql
-- ============================================================

-- Phase 2 — Client Monitoring Basics
-- Adds: checks, uptime_checks, performance_metrics
-- Run AFTER: 20260523000000_phase1_extended.sql

-- ─── checks ─────────────────────────────────────────────────────────────────
-- One row per check run (manual or cron). Links to individual result tables.
CREATE TABLE IF NOT EXISTS public.checks (
    id           SERIAL PRIMARY KEY,
    site_id      TEXT REFERENCES public.sites(id) ON DELETE CASCADE,
    check_type   TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'daily', 'cron'
    device       TEXT NOT NULL DEFAULT 'desktop', -- 'desktop', 'tablet', 'mobile'
    status       TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    score        INTEGER,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    summary      TEXT,
    raw_result   JSONB
);

-- ─── uptime_checks ───────────────────────────────────────────────────────────
-- Stores every HTTP + SSL check result. Retained for 18 months.
CREATE TABLE IF NOT EXISTS public.uptime_checks (
    id                  SERIAL PRIMARY KEY,
    site_id             TEXT REFERENCES public.sites(id) ON DELETE CASCADE,
    status              TEXT NOT NULL, -- 'up', 'down', 'degraded'
    http_status         INTEGER,
    response_time_ms    INTEGER,
    ssl_valid           BOOLEAN,
    ssl_days_remaining  INTEGER,
    ssl_expiry_date     DATE,
    ssl_issuer          TEXT,
    error               TEXT,
    checked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS uptime_checks_site_id_idx ON public.uptime_checks(site_id);
CREATE INDEX IF NOT EXISTS uptime_checks_checked_at_idx ON public.uptime_checks(checked_at DESC);

-- ─── performance_metrics ─────────────────────────────────────────────────────
-- Stores Lighthouse / Core Web Vitals data per site + device.
CREATE TABLE IF NOT EXISTS public.performance_metrics (
    id                  SERIAL PRIMARY KEY,
    site_id             TEXT REFERENCES public.sites(id) ON DELETE CASCADE,
    device              TEXT NOT NULL DEFAULT 'desktop',
    performance_score   INTEGER,
    accessibility_score INTEGER,
    seo_score           INTEGER,
    best_practices_score INTEGER,
    lcp                 NUMERIC, -- Largest Contentful Paint (seconds)
    cls                 NUMERIC, -- Cumulative Layout Shift (score)
    inp                 NUMERIC, -- Interaction to Next Paint (ms)
    fcp                 NUMERIC, -- First Contentful Paint (seconds)
    ttfb                NUMERIC, -- Time to First Byte (seconds)
    raw_result          JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS perf_metrics_site_id_idx ON public.performance_metrics(site_id);

-- ─── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.checks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uptime_checks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all monitoring data
DROP POLICY IF EXISTS "checks_select_authed" ON public.checks;
CREATE POLICY "checks_select_authed"  ON public.checks FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "checks_insert_authed" ON public.checks;
CREATE POLICY "checks_insert_authed"  ON public.checks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "checks_update_authed" ON public.checks;
CREATE POLICY "checks_update_authed"  ON public.checks FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "uptime_select_authed" ON public.uptime_checks;
CREATE POLICY "uptime_select_authed"  ON public.uptime_checks FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "uptime_insert_authed" ON public.uptime_checks;
CREATE POLICY "uptime_insert_authed"  ON public.uptime_checks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "perf_select_authed" ON public.performance_metrics;
CREATE POLICY "perf_select_authed"    ON public.performance_metrics FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "perf_insert_authed" ON public.performance_metrics;
CREATE POLICY "perf_insert_authed"    ON public.performance_metrics FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Service role bypasses RLS for server-side check writes
-- (no additional policy needed — service role always bypasses)

-- ─── Data retention function ──────────────────────────────────────────────────
-- Call periodically to prune data older than 18 months.
CREATE OR REPLACE FUNCTION public.prune_old_monitoring_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.uptime_checks
    WHERE checked_at < NOW() - INTERVAL '18 months';

    DELETE FROM public.performance_metrics
    WHERE created_at < NOW() - INTERVAL '18 months';

    DELETE FROM public.checks
    WHERE started_at < NOW() - INTERVAL '18 months';
END;
$$;


-- ============================================================
-- 20260523300000_phase3_wordpress.sql
-- ============================================================

-- Phase 3: WordPress Plugin
-- Adds api_key to sites, creates wordpress_snapshots table

-- Add api_key column to sites (plain text — hashed at application layer if needed)
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE;

-- Create index for fast lookup by api_key
CREATE INDEX IF NOT EXISTS sites_api_key_idx ON public.sites(api_key) WHERE api_key IS NOT NULL;

-- wordpress_snapshots: stores each plugin sync payload
CREATE TABLE IF NOT EXISTS public.wordpress_snapshots (
    id              SERIAL PRIMARY KEY,
    site_id         TEXT NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    wp_version      TEXT,
    php_version     TEXT,
    mysql_version   TEXT,
    theme_data      JSONB,   -- { name, version, template, parent_theme }
    plugin_data     JSONB,   -- array of { name, version, active, update_available, new_version }
    update_data     JSONB,   -- { core_update, plugin_updates, theme_updates }
    security_data   JSONB,   -- { debug_mode, admin_user_count, failed_logins, security_plugin }
    form_data       JSONB,   -- array of { plugin, name, submissions, last_submission }
    server_data     JSONB,   -- { db_size_mb, cron_enabled, site_health_score, error_log_lines }
    raw_payload     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for latest snapshot lookups per site
CREATE INDEX IF NOT EXISTS wp_snapshots_site_created_idx
    ON public.wordpress_snapshots(site_id, created_at DESC);

-- RLS
ALTER TABLE public.wordpress_snapshots ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read snapshots
CREATE POLICY "Authenticated users can read wordpress_snapshots"
    ON public.wordpress_snapshots
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Inserts come from the API route using the service role key (bypasses RLS)
-- No direct insert policy needed for anon/authenticated roles


-- ============================================================
-- 20260523400000_phase4_playwright.sql
-- ============================================================

-- Phase 4: Playwright QA tables

CREATE TABLE IF NOT EXISTS playwright_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE,
  device varchar(20) NOT NULL CHECK (device IN ('desktop', 'tablet', 'mobile')),
  url text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pass', 'fail', 'error', 'pending')),
  http_status integer,
  load_time_ms integer,
  page_title text,
  meta_description text,
  is_noindexed boolean DEFAULT false,
  has_h1 boolean DEFAULT true,
  has_navigation boolean DEFAULT true,
  console_errors jsonb DEFAULT '[]'::jsonb,
  network_errors jsonb DEFAULT '[]'::jsonb,
  screenshot_url text,
  baseline_url text,
  diff_url text,
  diff_percentage numeric(5,2),
  regression_detected boolean DEFAULT false,
  regression_threshold numeric(5,2) DEFAULT 10.0,
  forms_found jsonb DEFAULT '[]'::jsonb,
  issues_created integer DEFAULT 0,
  error_message text,
  checked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playwright_checks_site_id_idx ON playwright_checks(site_id);
CREATE INDEX IF NOT EXISTS playwright_checks_checked_at_idx ON playwright_checks(checked_at DESC);

ALTER TABLE playwright_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can read playwright_checks" ON playwright_checks;
CREATE POLICY "Auth users can read playwright_checks" ON playwright_checks
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Service role can insert playwright_checks" ON playwright_checks;
CREATE POLICY "Service role can insert playwright_checks" ON playwright_checks
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Service role can update playwright_checks" ON playwright_checks;
CREATE POLICY "Service role can update playwright_checks" ON playwright_checks
  FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS playwright_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE,
  device varchar(20) NOT NULL CHECK (device IN ('desktop', 'tablet', 'mobile')),
  screenshot_url text NOT NULL,
  approved_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(site_id, device)
);

ALTER TABLE playwright_baselines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can read playwright_baselines" ON playwright_baselines;
CREATE POLICY "Auth users can read playwright_baselines" ON playwright_baselines
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Service role can manage playwright_baselines" ON playwright_baselines;
CREATE POLICY "Service role can manage playwright_baselines" ON playwright_baselines
  FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS form_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE,
  form_name text,
  form_plugin text,
  page_url text,
  status varchar(20) NOT NULL DEFAULT 'not_tested' CHECK (status IN ('pass', 'fail', 'not_tested', 'skipped')),
  submission_tested boolean DEFAULT false,
  result_message text,
  fields_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_checks_site_id_idx ON form_checks(site_id);

ALTER TABLE form_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can read form_checks" ON form_checks;
CREATE POLICY "Auth users can read form_checks" ON form_checks
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Service role can manage form_checks" ON form_checks;
CREATE POLICY "Service role can manage form_checks" ON form_checks
  FOR ALL USING (true);


-- ============================================================
-- 20260523500000_phase5_reports.sql
-- ============================================================

-- Phase 5: Reports tables

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  site_id text REFERENCES sites(id) ON DELETE SET NULL,
  report_type varchar(20) NOT NULL DEFAULT 'monthly' CHECK (report_type IN ('daily', 'monthly', 'custom')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'error')),
  title text,
  executive_summary text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  share_token varchar(64) UNIQUE,
  generated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_client_id_idx ON reports(client_id);
CREATE INDEX IF NOT EXISTS reports_share_token_idx ON reports(share_token);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports(created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can read reports" ON reports;
CREATE POLICY "Auth users can read reports" ON reports
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Auth users can create reports" ON reports;
CREATE POLICY "Auth users can create reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Auth users can update reports" ON reports;
CREATE POLICY "Auth users can update reports" ON reports
  FOR UPDATE USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Service role bypasses RLS on reports" ON reports;
CREATE POLICY "Service role bypasses RLS on reports" ON reports
  FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  report_type varchar(20) NOT NULL DEFAULT 'monthly',
  frequency varchar(20) NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  send_hour integer DEFAULT 7 CHECK (send_hour BETWEEN 0 AND 23),
  send_day integer DEFAULT 1,
  recipients jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  last_sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage report_schedules" ON report_schedules;
CREATE POLICY "Auth users can manage report_schedules" ON report_schedules
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ============================================================
-- 20260523600000_phase6_analytics.sql
-- ============================================================

-- Phase 6: Analytics integration tables

-- Per-site integration configuration
CREATE TABLE IF NOT EXISTS site_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE UNIQUE,
  ga_property_id text,
  gsc_site_url text,
  clarity_project_id text,
  clarity_api_key text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE site_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage site_integrations" ON site_integrations;
CREATE POLICY "Auth users can manage site_integrations" ON site_integrations
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Google Analytics snapshots
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_snapshots_site_id_idx ON analytics_snapshots(site_id);
CREATE INDEX IF NOT EXISTS analytics_snapshots_created_at_idx ON analytics_snapshots(created_at DESC);

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can read analytics_snapshots" ON analytics_snapshots;
CREATE POLICY "Auth users can read analytics_snapshots" ON analytics_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Service role can manage analytics_snapshots" ON analytics_snapshots;
CREATE POLICY "Service role can manage analytics_snapshots" ON analytics_snapshots
  FOR ALL USING (true);

-- Google Search Console snapshots
CREATE TABLE IF NOT EXISTS search_console_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gsc_snapshots_site_id_idx ON search_console_snapshots(site_id);
CREATE INDEX IF NOT EXISTS gsc_snapshots_created_at_idx ON search_console_snapshots(created_at DESC);

ALTER TABLE search_console_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can read search_console_snapshots" ON search_console_snapshots;
CREATE POLICY "Auth users can read search_console_snapshots" ON search_console_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Service role can manage search_console_snapshots" ON search_console_snapshots;
CREATE POLICY "Service role can manage search_console_snapshots" ON search_console_snapshots
  FOR ALL USING (true);

-- Microsoft Clarity snapshots
CREATE TABLE IF NOT EXISTS clarity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  insights jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clarity_snapshots_site_id_idx ON clarity_snapshots(site_id);

ALTER TABLE clarity_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can read clarity_snapshots" ON clarity_snapshots;
CREATE POLICY "Auth users can read clarity_snapshots" ON clarity_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Service role can manage clarity_snapshots" ON clarity_snapshots;
CREATE POLICY "Service role can manage clarity_snapshots" ON clarity_snapshots
  FOR ALL USING (true);


-- ============================================================
-- 20260523700000_phase7_ai.sql
-- ============================================================

-- Phase 7: AI Layer — ai_messages table
-- Stores all AI-generated content: summaries, issue analysis, chat, SEO briefs

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE,
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  message_type varchar(30) NOT NULL DEFAULT 'chat'
    CHECK (message_type IN ('chat', 'summary', 'issue_analysis', 'seo_brief', 'fix_recommendation')),
  question text,
  answer text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  model varchar(60),
  tokens_used integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_messages_site_id_idx ON ai_messages(site_id);
CREATE INDEX IF NOT EXISTS ai_messages_created_at_idx ON ai_messages(created_at DESC);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users can read ai_messages" ON ai_messages;
CREATE POLICY "Auth users can read ai_messages" ON ai_messages
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Service role can manage ai_messages" ON ai_messages;
CREATE POLICY "Service role can manage ai_messages" ON ai_messages
  FOR ALL USING (true);


-- ============================================================
-- 20260523800000_phase8_alerts.sql
-- ============================================================

-- Phase 8: Alerts — notification_logs + alert_settings tables

-- ─── notification_logs ────────────────────────────────────────────────────────
-- Records every alert that was sent, skipped, or failed

CREATE TABLE IF NOT EXISTS notification_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     text        REFERENCES sites(id) ON DELETE CASCADE,
  issue_id    uuid        REFERENCES issues(id) ON DELETE SET NULL,
  channel     varchar(20) NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  recipient   text        NOT NULL,
  status      varchar(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  alert_type  varchar(40),
  subject     text,
  message     text,
  error       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_logs_site_id_idx  ON notification_logs(site_id);
CREATE INDEX IF NOT EXISTS notification_logs_created_at_idx ON notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS notification_logs_channel_idx  ON notification_logs(channel, site_id, created_at DESC);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users can read notification_logs" ON notification_logs;
CREATE POLICY "Auth users can read notification_logs" ON notification_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Service role can manage notification_logs" ON notification_logs;
CREATE POLICY "Service role can manage notification_logs" ON notification_logs
  FOR ALL USING (true);


-- ─── alert_settings ───────────────────────────────────────────────────────────
-- Singleton row (id = 1) holding global alert config

CREATE TABLE IF NOT EXISTS alert_settings (
  id                        integer   PRIMARY KEY DEFAULT 1,
  email_recipients          text[]    DEFAULT '{}',
  whatsapp_recipients       text[]    DEFAULT '{}',
  email_alerts_enabled      boolean   DEFAULT true,
  whatsapp_alerts_enabled   boolean   DEFAULT false,
  alert_on_site_down        boolean   DEFAULT true,
  alert_on_ssl_critical     boolean   DEFAULT true,
  alert_on_critical_issues  boolean   DEFAULT true,
  dedup_window_hours        integer   DEFAULT 4,
  updated_at                timestamptz DEFAULT now()
);

-- Ensure only one row can ever exist
ALTER TABLE alert_settings ADD CONSTRAINT alert_settings_single_row CHECK (id = 1);

-- Insert default row
INSERT INTO alert_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users can read alert_settings" ON alert_settings;
CREATE POLICY "Auth users can read alert_settings" ON alert_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Service role can manage alert_settings" ON alert_settings;
CREATE POLICY "Service role can manage alert_settings" ON alert_settings
  FOR ALL USING (true);


-- ============================================================
-- 20260523900000_domain_checks.sql
-- ============================================================

-- Migration: domain_checks table
-- Stores RDAP domain expiry check results per site.

CREATE TABLE IF NOT EXISTS domain_checks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       text        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  domain        text        NOT NULL,
  expiry_date   date,
  days_remaining integer,
  registrar     text,
  error         text,
  checked_at    timestamptz NOT NULL DEFAULT now()
);

-- Index: most recent check per site is the common query
CREATE INDEX IF NOT EXISTS idx_domain_checks_site_checked
  ON domain_checks (site_id, checked_at DESC);

-- Row Level Security
ALTER TABLE domain_checks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read domain checks"
  ON domain_checks
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role can do everything (bypasses RLS automatically for service_role key,
-- but explicit policy keeps things consistent if policy check is forced).
CREATE POLICY "Service role full access to domain checks"
  ON domain_checks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


