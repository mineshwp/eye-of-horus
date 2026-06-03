-- Migration: analytics-based alert toggles (Phase 1c)
-- New trigger types: performance-score drop, traffic drop, JS-error spike,
-- conversion (form-submission) drop. Email delivery now; WhatsApp deferred.

ALTER TABLE public.alert_settings
  ADD COLUMN IF NOT EXISTS alert_on_performance_drop boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_on_traffic_drop     boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_on_js_errors        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_on_conversion_drop  boolean DEFAULT true;
