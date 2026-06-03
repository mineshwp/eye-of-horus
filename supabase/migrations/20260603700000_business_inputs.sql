-- Migration: per-site business inputs (Phase 5 — business intelligence)
-- Admin-entered values supplied by each client. Drives ROI, campaign, and
-- competitor-benchmark reporting without any external integration.

CREATE TABLE IF NOT EXISTS business_inputs (
  site_id                text        PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  currency               text        NOT NULL DEFAULT 'ZAR',
  conversion_type        text        NOT NULL DEFAULT 'leads',   -- leads | sales
  avg_conversion_value   numeric     NOT NULL DEFAULT 0,         -- avg value of one conversion
  monthly_ad_spend       numeric     NOT NULL DEFAULT 0,
  monthly_retainer       numeric     NOT NULL DEFAULT 0,         -- agency fee, for ROI
  target_conversion_rate numeric     NOT NULL DEFAULT 0,         -- percent
  qualified_leads        integer     NOT NULL DEFAULT 0,         -- admin-entered, this month
  campaigns              jsonb       NOT NULL DEFAULT '[]'::jsonb, -- [{name, landing_path, monthly_spend}]
  competitors            jsonb       NOT NULL DEFAULT '[]'::jsonb, -- [{name, url, performance, seo, checked_at}]
  notes                  text,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE business_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read business_inputs"
  ON business_inputs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role business_inputs"
  ON business_inputs FOR ALL TO service_role USING (true) WITH CHECK (true);
