-- Phase 1 Extended Schema
-- Adds: profiles, clients, client_users, access_requests
-- Run AFTER: 20260522000000_init_schema.sql

-- ─── profiles ───────────────────────────────────────────────────────────────
-- User profiles linked to Supabase Auth.
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'client')),
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_idx ON public.profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

-- ─── clients ────────────────────────────────────────────────────────────────
-- Agency clients. Each client can have one or more monitored sites.
-- Note: the existing "sites" table stores monitoring data per site.
-- Clients are the business entities that own those sites.
CREATE TABLE IF NOT EXISTS public.clients (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    website_url  TEXT NOT NULL,
    industry     TEXT,
    logo_url     TEXT,
    status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── client_users ───────────────────────────────────────────────────────────
-- Maps users to the clients they can access.
CREATE TABLE IF NOT EXISTS public.client_users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('manager', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(client_id, user_id)
);

-- ─── access_requests ────────────────────────────────────────────────────────
-- Access request submissions from the /request-access page.
CREATE TABLE IF NOT EXISTS public.access_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    company     TEXT NOT NULL,
    role        TEXT NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- profiles: users can read and update their own profile
CREATE POLICY "profiles_select_own"   ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_update_own"   ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
-- admins can read all profiles (uses a helper function below)
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);
CREATE POLICY "profiles_insert_system" ON public.profiles FOR INSERT WITH CHECK (true);

-- clients: any authenticated user can select; only admins can modify
CREATE POLICY "clients_select_authed"  ON public.clients FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "clients_modify_admin"   ON public.clients FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);

-- client_users: authenticated users can see their own assignments
CREATE POLICY "client_users_select_own" ON public.client_users FOR SELECT USING (auth.uid() = user_id);
-- admins can manage all assignments
CREATE POLICY "client_users_admin"      ON public.client_users FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);

-- access_requests: anyone can insert (public form); only admins can read/update
CREATE POLICY "access_requests_insert_public" ON public.access_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "access_requests_admin"         ON public.access_requests FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);
CREATE POLICY "access_requests_update_admin"  ON public.access_requests FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('super_admin', 'admin'))
);

-- ─── Seed sample clients ─────────────────────────────────────────────────────
-- These mirror the sites in the init migration.
INSERT INTO public.clients (name, website_url, industry, status) VALUES
    ('Acme Finance',        'https://acmefinance.co.za',        'Financial Services', 'active'),
    ('Greenfield Estates',  'https://greenfieldestates.com',    'Real Estate',        'active'),
    ('Nova Legal',          'https://novalegal.law',            'Legal Services',     'active'),
    ('Flexcom Recruitment', 'https://flexcom.jobs',             'Recruitment',        'active'),
    ('Gentech Industries',  'https://gentech.io',               'Technology',         'active'),
    ('Tarsus Cloud Portal', 'https://portal.tarsuscloud.com',   'Technology',         'active'),
    ('Wetpaint Corporate',  'https://wetpaint.co.za',           'Marketing Agency',   'active')
ON CONFLICT DO NOTHING;
