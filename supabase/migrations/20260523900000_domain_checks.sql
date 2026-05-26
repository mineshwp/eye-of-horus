-- Migration: domain_checks table
-- Stores RDAP domain expiry check results per site.

CREATE TABLE IF NOT EXISTS domain_checks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       text        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  domain        text        NOT NULL,
  expiry_date   date,
  days_remaining integer,
  registrar     text,
  error         text,
  checked_at    timestamptz NOT NULL DEFAULT now()
);

-- Index: most recent check per site is the common query
CREATE INDEX IF NOT EXISTS idx_domain_checks_site_checked
  ON domain_checks (site_id, checked_at DESC);

-- Row Level Security
ALTER TABLE domain_checks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read domain checks"
  ON domain_checks
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role can do everything (bypasses RLS automatically for service_role key,
-- but explicit policy keeps things consistent if policy check is forced).
CREATE POLICY "Service role full access to domain checks"
  ON domain_checks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
