-- Add TTI (Time to Interactive) column to performance_metrics.
-- PSI/Lighthouse returns this via the "interactive" audit.
-- ttfb remains for future TTFB tracking; tti is what the UI and PSI sync use.

ALTER TABLE performance_metrics
  ADD COLUMN IF NOT EXISTS tti numeric;
