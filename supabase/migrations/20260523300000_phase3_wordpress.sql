-- Phase 3: WordPress Plugin
-- Adds api_key to sites, creates wordpress_snapshots table

-- Add api_key column to sites (plain text — hashed at application layer if needed)
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE;

-- Create index for fast lookup by api_key
CREATE INDEX IF NOT EXISTS sites_api_key_idx ON public.sites(api_key) WHERE api_key IS NOT NULL;

-- wordpress_snapshots: stores each plugin sync payload
CREATE TABLE IF NOT EXISTS public.wordpress_snapshots (
    id              SERIAL PRIMARY KEY,
    site_id         TEXT NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    wp_version      TEXT,
    php_version     TEXT,
    mysql_version   TEXT,
    theme_data      JSONB,   -- { name, version, template, parent_theme }
    plugin_data     JSONB,   -- array of { name, version, active, update_available, new_version }
    update_data     JSONB,   -- { core_update, plugin_updates, theme_updates }
    security_data   JSONB,   -- { debug_mode, admin_user_count, failed_logins, security_plugin }
    form_data       JSONB,   -- array of { plugin, name, submissions, last_submission }
    server_data     JSONB,   -- { db_size_mb, cron_enabled, site_health_score, error_log_lines }
    raw_payload     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for latest snapshot lookups per site
CREATE INDEX IF NOT EXISTS wp_snapshots_site_created_idx
    ON public.wordpress_snapshots(site_id, created_at DESC);

-- RLS
ALTER TABLE public.wordpress_snapshots ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read snapshots
CREATE POLICY "Authenticated users can read wordpress_snapshots"
    ON public.wordpress_snapshots
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Inserts come from the API route using the service role key (bypasses RLS)
-- No direct insert policy needed for anon/authenticated roles
