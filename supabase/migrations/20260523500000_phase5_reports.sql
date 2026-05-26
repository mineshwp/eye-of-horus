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
CREATE POLICY "Auth users can read reports" ON reports
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can create reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can update reports" ON reports
  FOR UPDATE USING (auth.uid() IS NOT NULL);
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
CREATE POLICY "Auth users can manage report_schedules" ON report_schedules
  FOR ALL USING (auth.uid() IS NOT NULL);
