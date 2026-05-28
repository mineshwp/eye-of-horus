-- Add configurable Microsoft Clarity Data Export API endpoint URL.
-- Official default:
-- https://www.clarity.ms/export-data/api/v1/project-live-insights

ALTER TABLE site_integrations
  ADD COLUMN IF NOT EXISTS clarity_endpoint_url text
  DEFAULT 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

UPDATE site_integrations
SET clarity_endpoint_url = 'https://www.clarity.ms/export-data/api/v1/project-live-insights'
WHERE clarity_endpoint_url IS NULL OR trim(clarity_endpoint_url) = '';
