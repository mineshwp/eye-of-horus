-- Migration: SEO crawl audit
-- Stores the results of the site-wide SEO/content crawl (Phase 1a).
--
-- `seo_audits` holds one summary row per crawl run.
-- `broken_links` holds individual broken-link findings for that run.

CREATE TABLE IF NOT EXISTS seo_audits (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                text        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  pages_crawled          integer     NOT NULL DEFAULT 0,
  links_checked          integer     NOT NULL DEFAULT 0,
  broken_links_count     integer     NOT NULL DEFAULT 0,
  missing_titles         integer     NOT NULL DEFAULT 0,
  duplicate_titles       integer     NOT NULL DEFAULT 0,
  missing_descriptions   integer     NOT NULL DEFAULT 0,
  duplicate_descriptions integer     NOT NULL DEFAULT 0,
  missing_h1             integer     NOT NULL DEFAULT 0,
  thin_content_count     integer     NOT NULL DEFAULT 0,
  images_missing_alt     integer     NOT NULL DEFAULT 0,
  pages_with_schema      integer     NOT NULL DEFAULT 0,
  has_sitemap            boolean,
  has_robots             boolean,
  sitemap_url            text,
  score                  integer     NOT NULL DEFAULT 100,
  summary                jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- per-page detail + finding arrays
  error                  text,
  checked_at             timestamptz NOT NULL DEFAULT now()
);

-- Most recent audit per site is the common query.
CREATE INDEX IF NOT EXISTS idx_seo_audits_site_checked
  ON seo_audits (site_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS broken_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     text        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  audit_id    uuid        NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  url         text        NOT NULL,        -- the link target that failed
  status      integer     NOT NULL DEFAULT 0,  -- HTTP status, or 0 for a network error
  found_on    text,                        -- the page the broken link was found on
  link_text   text,
  is_internal boolean     NOT NULL DEFAULT true,
  checked_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broken_links_audit ON broken_links (audit_id);
CREATE INDEX IF NOT EXISTS idx_broken_links_site  ON broken_links (site_id, checked_at DESC);

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE seo_audits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE broken_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read seo audits"
  ON seo_audits FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access to seo audits"
  ON seo_audits FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read broken links"
  ON broken_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access to broken links"
  ON broken_links FOR ALL TO service_role USING (true) WITH CHECK (true);
