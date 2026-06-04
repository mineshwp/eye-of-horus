-- Migration: button actions persistence
-- Backs the interactive controls that were previously toast-only (no persisted
-- state): issue Escalate / Snooze / Auto-fix, WordPress Skip / Stage, visual
-- regression Approve / Flag / Defer, and Settings custom alert rules.
--
-- All additive + idempotent. New columns inherit the existing role-gated RLS
-- policies on their tables (staff full access; see 20260603900000).

-- ── issues: escalation, snooze, auto-fix tracking ────────────────────────────
ALTER TABLE issues ADD COLUMN IF NOT EXISTS client_facing        boolean     NOT NULL DEFAULT false;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS escalated_at         timestamptz;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS snoozed_until        timestamptz;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS autofix_requested    boolean     NOT NULL DEFAULT false;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS autofix_requested_at timestamptz;

-- Snoozed alerts are queried by expiry during alert dedup.
CREATE INDEX IF NOT EXISTS idx_issues_snoozed_until ON issues (snoozed_until);

-- ── wp_updates: skip-for-30-days + staging workflow ──────────────────────────
ALTER TABLE wp_updates ADD COLUMN IF NOT EXISTS skipped_until  timestamptz;
-- staging_status: null | 'queued' | 'passed' | 'failed'
ALTER TABLE wp_updates ADD COLUMN IF NOT EXISTS staging_status text;

-- ── playwright_checks: visual-regression review decision ─────────────────────
-- review_status: 'pending' | 'approved' | 'flagged' | 'deferred'
ALTER TABLE playwright_checks ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending';
ALTER TABLE playwright_checks ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz;
ALTER TABLE playwright_checks ADD COLUMN IF NOT EXISTS reviewed_by   text;

-- ── alert_rules: custom per-severity alert rules (Settings → Alert rules) ────
CREATE TABLE IF NOT EXISTS alert_rules (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  severity   text        NOT NULL,             -- critical | high | medium | info
  trigger    text        NOT NULL,             -- human description of the trigger
  channels   text        NOT NULL DEFAULT '',  -- e.g. "Email alert recipients · WhatsApp"
  template   text,                             -- optional custom message template
  enabled    boolean     NOT NULL DEFAULT true,
  is_builtin boolean     NOT NULL DEFAULT false,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_sort ON alert_rules (sort_order, created_at);

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_rules_staff_all" ON alert_rules;
CREATE POLICY "alert_rules_staff_all" ON alert_rules FOR ALL TO authenticated
  USING (public.get_my_role() IN ('super_admin','admin'))
  WITH CHECK (public.get_my_role() IN ('super_admin','admin'));

DROP POLICY IF EXISTS "alert_rules_service" ON alert_rules;
CREATE POLICY "alert_rules_service" ON alert_rules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed the four built-in rules that were previously hardcoded in the UI.
INSERT INTO alert_rules (severity, trigger, channels, is_builtin, sort_order)
SELECT * FROM (VALUES
  ('critical', 'Critical issue detected',                      'Email alert recipients · WhatsApp if configured', true, 0),
  ('high',     'High severity issue · client-facing impact',   'Email alert recipients',                          true, 1),
  ('medium',   'Visual change detected · awaiting review',     'Daily digest',                                    true, 2),
  ('info',     'WordPress update available · low risk',        'Weekly digest',                                   true, 3)
) AS v(severity, trigger, channels, is_builtin, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE is_builtin = true);
