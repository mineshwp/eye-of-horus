-- Migration: Real-User Monitoring (Phase 3 foundation)
-- Frontend tracking script sends field data here via /api/rum/ingest.
--
-- tracking_id is a PUBLIC per-site identifier embedded in the client script
-- (never the secret api_key). rum_enabled gates collection per site.

-- ── sites: public tracking id + enable flag ──────────────────────────────────
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS tracking_id text,
  ADD COLUMN IF NOT EXISTS rum_enabled boolean NOT NULL DEFAULT false;

-- Backfill a public tracking id for existing sites (16 hex chars).
UPDATE public.sites
  SET tracking_id = substr(md5(gen_random_uuid()::text), 1, 16)
  WHERE tracking_id IS NULL;

-- Default for new rows + uniqueness.
ALTER TABLE public.sites
  ALTER COLUMN tracking_id SET DEFAULT substr(md5(gen_random_uuid()::text), 1, 16);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_tracking_id ON public.sites (tracking_id);

-- ── rum_sessions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rum_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       text        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  session_id    text        NOT NULL,   -- client-generated, per visit
  visitor_id    text,                   -- client persistent id (new vs returning)
  is_returning  boolean     NOT NULL DEFAULT false,
  entry_path    text,
  exit_path     text,
  referrer      text,
  source        text,                   -- referrer host / utm_source if present
  device        text,                   -- mobile | tablet | desktop
  country       text,                   -- coarse, from CDN header (optional)
  pageviews     integer     NOT NULL DEFAULT 1,
  started_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rum_sessions_session ON rum_sessions (site_id, session_id);
CREATE INDEX IF NOT EXISTS idx_rum_sessions_site_time ON rum_sessions (site_id, started_at DESC);

-- ── rum_vitals (field Core Web Vitals) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS rum_vitals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     text        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  session_id  text,
  path        text,
  metric      text        NOT NULL,     -- LCP | INP | CLS | FCP | TTFB
  value       numeric     NOT NULL,
  rating      text,                     -- good | needs-improvement | poor
  device      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rum_vitals_site_time ON rum_vitals (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rum_vitals_metric ON rum_vitals (site_id, metric, created_at DESC);

-- ── rum_events (clicks, search, scroll, rage, downloads…) ─────────────────────
CREATE TABLE IF NOT EXISTS rum_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     text        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  session_id  text,
  type        text        NOT NULL,     -- pageview | click | cta | outbound | download | search | rage_click | scroll
  path        text,
  target      text,                     -- href / label / selector
  value       text,                     -- search query, scroll depth %, etc.
  meta        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rum_events_site_time ON rum_events (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rum_events_type ON rum_events (site_id, type, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE rum_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rum_vitals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rum_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read rum_sessions" ON rum_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role rum_sessions"        ON rum_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read rum_vitals"   ON rum_vitals   FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role rum_vitals"          ON rum_vitals   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read rum_events"   ON rum_events   FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role rum_events"          ON rum_events   FOR ALL TO service_role USING (true) WITH CHECK (true);
