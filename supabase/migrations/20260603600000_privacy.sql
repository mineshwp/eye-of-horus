-- Migration: Privacy & compliance (Phase 4)
--  • RUM consent mode + Do-Not-Track respect per site
--  • Team-action audit log
--  • Configurable RUM data retention (global setting)

-- ── RUM consent controls ─────────────────────────────────────────────────────
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS rum_consent_mode text    NOT NULL DEFAULT 'on',   -- on | opt-in | opt-out
  ADD COLUMN IF NOT EXISTS rum_respect_dnt  boolean NOT NULL DEFAULT true;

-- ── Team-action audit log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email text,
  action      text        NOT NULL,        -- e.g. report.approve, rum.toggle, settings.update
  target_type text,                        -- report | site | settings | alert_settings | issue
  target_id   text,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_email, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read audit_log" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role audit_log"        ON audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Configurable RUM retention (days) ────────────────────────────────────────
INSERT INTO public.global_settings (key, value)
  VALUES ('rum_retention_days', '180')
  ON CONFLICT (key) DO NOTHING;
