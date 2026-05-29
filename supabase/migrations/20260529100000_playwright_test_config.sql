-- Per-site Playwright/Watchtower test configuration.
-- Stores which pages to scan for visual regression and which forms to test.
--
-- Shape of sites.test_config:
-- {
--   "pages": [ { "path": "/", "label": "Home", "visual": true } ],
--   "forms": [ {
--       "path": "/contact",
--       "label": "Contact form",
--       "selector": "form",          -- CSS selector for the form (optional, defaults to first form)
--       "fields": { "email": "qa@test.invalid", "name": "QA Test" },  -- name/placeholder -> value
--       "successText": "Thank you"   -- text expected on the page after a successful submit
--   } ]
-- }

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS test_config jsonb NOT NULL DEFAULT '{"pages": [], "forms": []}'::jsonb;

-- Record which page path a check belongs to, so the UI can group/select by page.
ALTER TABLE public.playwright_checks
  ADD COLUMN IF NOT EXISTS page_path text;

-- Backfill existing rows to the homepage path so they still display.
UPDATE public.playwright_checks SET page_path = '/' WHERE page_path IS NULL;
