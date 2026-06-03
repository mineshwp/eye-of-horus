-- Report data fixes
-- 1. issues.detected_at — a real timestamp for period filtering.
--    The existing `detected` column holds a human label ("Today, 09:14") and
--    cannot be range-queried. detected_at defaults to now() so every insert
--    path (WordPress sync, audits, SEO, a11y, etc.) is stamped automatically.
ALTER TABLE public.issues
    ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS issues_site_detected_at_idx
    ON public.issues (site_id, detected_at DESC);

-- 2. wordpress_snapshots.wordfence_data — the plugin sends a `wordfence_data`
--    object, but it was only landing in raw_payload. Give it a first-class
--    column so the dashboard/report Wordfence sections can read it.
ALTER TABLE public.wordpress_snapshots
    ADD COLUMN IF NOT EXISTS wordfence_data JSONB;
