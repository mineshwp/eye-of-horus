-- Migration: Total Blocking Time on performance_metrics
-- TBT is the lab interactivity metric Lighthouse produces (the lab proxy for
-- INP, which cannot be measured in lab mode). The Desktop/Mobile Page Speed
-- cards now show TBT instead of a perpetually-empty lab INP.
ALTER TABLE performance_metrics ADD COLUMN IF NOT EXISTS tbt numeric; -- Total Blocking Time (ms)
