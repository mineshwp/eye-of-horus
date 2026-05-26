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
CREATE POLICY "Auth users can read playwright_checks" ON playwright_checks
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Service role can insert playwright_checks" ON playwright_checks
  FOR INSERT WITH CHECK (true);
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
CREATE POLICY "Auth users can read playwright_baselines" ON playwright_baselines
  FOR SELECT USING (auth.uid() IS NOT NULL);
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
CREATE POLICY "Auth users can read form_checks" ON form_checks
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Service role can manage form_checks" ON form_checks
  FOR ALL USING (true);
