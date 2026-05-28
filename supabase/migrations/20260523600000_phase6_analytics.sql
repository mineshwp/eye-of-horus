-- Phase 6: Analytics integration tables

-- Per-site integration configuration
CREATE TABLE IF NOT EXISTS site_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE UNIQUE,
  ga_property_id text,
  gsc_site_url text,
  clarity_project_id text,
  clarity_api_key text,
  clarity_endpoint_url text DEFAULT 'https://www.clarity.ms/export-data/api/v1/project-live-insights',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE site_integrations ENABLE ROW LEVEL SECURITY;
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
CREATE POLICY "Auth users can read analytics_snapshots" ON analytics_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);
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
CREATE POLICY "Auth users can read search_console_snapshots" ON search_console_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);
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
CREATE POLICY "Auth users can read clarity_snapshots" ON clarity_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Service role can manage clarity_snapshots" ON clarity_snapshots
  FOR ALL USING (true);
