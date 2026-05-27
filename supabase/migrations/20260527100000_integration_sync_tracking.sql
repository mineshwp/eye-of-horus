-- Integration sync tracking — Phase 6 follow-up
-- Adds per-source sync counts, last-synced timestamps, and Clarity daily-limit tracking
-- to the site_integrations table.
-- Also seeds the analytics_sync_time key into global_settings.

-- ── site_integrations additions ──────────────────────────────────────────────

ALTER TABLE site_integrations
  ADD COLUMN IF NOT EXISTS ga_sync_count_today    int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ga_sync_count_total    int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ga_last_synced_at      timestamptz,

  ADD COLUMN IF NOT EXISTS gsc_sync_count_today   int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gsc_sync_count_total   int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gsc_last_synced_at     timestamptz,

  ADD COLUMN IF NOT EXISTS clarity_sync_count_today int        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clarity_sync_count_total int        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clarity_last_synced_at   timestamptz,
  ADD COLUMN IF NOT EXISTS clarity_daily_limit      int        NOT NULL DEFAULT 10,

  -- Date used to decide when to reset the *_today counters (reset on new day)
  ADD COLUMN IF NOT EXISTS sync_counts_date date;

-- ── global_settings additions ─────────────────────────────────────────────────

-- Seed the analytics_sync_time key (stored as "HH:MM" in UTC, default 02:00).
-- The cron job reads this to know what time to run analytics sync.
-- Users can change it in Settings → Sites & scanning.
INSERT INTO global_settings (key, value) VALUES
  ('analytics_sync_time', '02:00')
ON CONFLICT (key) DO NOTHING;
