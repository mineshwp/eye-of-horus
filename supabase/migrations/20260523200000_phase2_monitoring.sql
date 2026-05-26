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
CREATE POLICY "checks_select_authed"  ON public.checks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "checks_insert_authed"  ON public.checks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "checks_update_authed"  ON public.checks FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "uptime_select_authed"  ON public.uptime_checks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "uptime_insert_authed"  ON public.uptime_checks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "perf_select_authed"    ON public.performance_metrics FOR SELECT USING (auth.uid() IS NOT NULL);
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
