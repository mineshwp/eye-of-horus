-- Migration: accessibility audit (Phase 1b)
-- Stores itemized axe-core (WCAG 2.1 A & AA) violations per Watchtower check,
-- so the UI can show specific issues (contrast, labels, heading order, etc.)
-- instead of only the Lighthouse accessibility score.

ALTER TABLE public.playwright_checks
  ADD COLUMN IF NOT EXISTS a11y_violations       jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS a11y_violation_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS a11y_serious_count    integer NOT NULL DEFAULT 0;
