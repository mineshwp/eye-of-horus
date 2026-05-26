-- Phase 8: Alerts — notification_logs + alert_settings tables

-- ─── notification_logs ────────────────────────────────────────────────────────
-- Records every alert that was sent, skipped, or failed

CREATE TABLE IF NOT EXISTS notification_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     text        REFERENCES sites(id) ON DELETE CASCADE,
  issue_id    text        REFERENCES issues(id) ON DELETE SET NULL,
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

CREATE POLICY "Auth users can read notification_logs" ON notification_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

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

CREATE POLICY "Auth users can read alert_settings" ON alert_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage alert_settings" ON alert_settings
  FOR ALL USING (true);
