-- Create sites table
CREATE TABLE IF NOT EXISTS public.sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    initials TEXT NOT NULL,
    brand TEXT NOT NULL,
    health INTEGER NOT NULL,
    status TEXT NOT NULL,
    uptime NUMERIC NOT NULL,
    perf INTEGER NOT NULL,
    sec INTEGER NOT NULL,
    open_issues INTEGER NOT NULL,
    wp_core TEXT NOT NULL,
    wp_core_latest TEXT NOT NULL,
    wp_plugins INTEGER NOT NULL,
    wp_themes INTEGER NOT NULL,
    forms TEXT NOT NULL,
    last_scan TEXT NOT NULL
);

-- Create issues table
CREATE TABLE IF NOT EXISTS public.issues (
    id TEXT PRIMARY KEY,
    site_id TEXT REFERENCES public.sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    impact TEXT NOT NULL,
    category TEXT NOT NULL,
    page TEXT NOT NULL,
    recommended TEXT NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL,
    detected TEXT NOT NULL,
    change_type TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    evidence JSONB
);

-- Create wp_updates table
CREATE TABLE IF NOT EXISTS public.wp_updates (
    id TEXT PRIMARY KEY,
    site_id TEXT REFERENCES public.sites(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    risk TEXT NOT NULL,
    priority TEXT NOT NULL,
    notes TEXT NOT NULL,
    flag TEXT NOT NULL
);

-- Create activities table
CREATE TABLE IF NOT EXISTS public.activities (
    id SERIAL PRIMARY KEY,
    time TEXT NOT NULL,
    site_name TEXT NOT NULL,
    text TEXT NOT NULL,
    sev TEXT NOT NULL,
    type TEXT NOT NULL
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Create public read/write access policies (since this is a single-tenant admin console for the agency)
CREATE POLICY "Allow public select on sites" ON public.sites FOR SELECT USING (true);
CREATE POLICY "Allow public insert on sites" ON public.sites FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on sites" ON public.sites FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on sites" ON public.sites FOR DELETE USING (true);

CREATE POLICY "Allow public select on issues" ON public.issues FOR SELECT USING (true);
CREATE POLICY "Allow public insert on issues" ON public.issues FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on issues" ON public.issues FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on issues" ON public.issues FOR DELETE USING (true);

CREATE POLICY "Allow public select on wp_updates" ON public.wp_updates FOR SELECT USING (true);
CREATE POLICY "Allow public insert on wp_updates" ON public.wp_updates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on wp_updates" ON public.wp_updates FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on wp_updates" ON public.wp_updates FOR DELETE USING (true);

CREATE POLICY "Allow public select on activities" ON public.activities FOR SELECT USING (true);
CREATE POLICY "Allow public insert on activities" ON public.activities FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on activities" ON public.activities FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on activities" ON public.activities FOR DELETE USING (true);

-- Clear existing seed data if any
DELETE FROM public.wp_updates;
DELETE FROM public.issues;
DELETE FROM public.sites;
DELETE FROM public.activities;

-- Seed data for sites
INSERT INTO public.sites (id, name, url, initials, brand, health, status, uptime, perf, sec, open_issues, wp_core, wp_core_latest, wp_plugins, wp_themes, forms, last_scan) VALUES
('acme', 'Acme Finance', 'acmefinance.co.za', 'AF', '#3B82F6', 64, 'critical', 99.96, 72, 86, 4, '6.5.2', '6.6.1', 6, 1, 'issue', '12 min ago'),
('greenfield', 'Greenfield Estates', 'greenfieldestates.com', 'GE', '#22C55E', 88, 'attention', 99.99, 84, 92, 2, '6.6.1', '6.6.1', 3, 0, 'ok', '8 min ago'),
('nova', 'Nova Legal', 'novalegal.law', 'NL', '#8B5CF6', 94, 'healthy', 100.0, 91, 96, 0, '6.6.1', '6.6.1', 1, 0, 'ok', '5 min ago'),
('flexcom', 'Flexcom Recruitment', 'flexcom.jobs', 'FX', '#F59E0B', 79, 'attention', 99.92, 76, 88, 3, '6.5.5', '6.6.1', 4, 1, 'ok', '21 min ago'),
('gentech', 'Gentech Industries', 'gentech.io', 'GT', '#00E5FF', 71, 'attention', 99.84, 68, 79, 5, '6.4.3', '6.6.1', 8, 2, 'ok', '1 hr ago'),
('tarsus', 'Tarsus Cloud Portal', 'portal.tarsuscloud.com', 'TC', '#EF4444', 58, 'critical', 99.41, 62, 71, 7, '6.5.1', '6.6.1', 11, 1, 'issue', '3 min ago'),
('wetpaint', 'Wetpaint Corporate', 'wetpaint.co.za', 'WP', '#D9A05B', 96, 'healthy', 100.0, 94, 98, 0, '6.6.1', '6.6.1', 0, 0, 'ok', '2 min ago');

-- Seed data for issues
INSERT INTO public.issues (id, site_id, title, severity, impact, category, page, recommended, owner, status, detected, change_type, confidence, evidence) VALUES
('i1', 'acme', 'Homepage hero button missing on mobile', 'critical', 'Lead generation affected', 'Visual regression', '/', 'Restore primary CTA on viewports < 768px. Recent theme update overrode mobile visibility.', 'M. Patel', 'Investigating', 'Today, 09:14', 'Broken component', 96, '{"left": "12%", "top": "62%", "width": "32%", "height": "10%"}'),
('i2', 'tarsus', 'Contact form submissions failing', 'critical', 'Inbound leads not received', 'Form failure', '/contact-us', 'Endpoint /wp-admin/admin-ajax.php returning 500. Disable Form-Pro 4.2.1 update and rollback to 4.1.9.', 'J. Ndlovu', 'In Progress', 'Today, 06:42', 'Server error', 99, '{}'),
('i3', 'gentech', 'Plugin update pending with compatibility risk', 'high', 'WooCommerce checkout may break', 'WordPress update', 'wp-admin', 'Stage WooCommerce 9.0 update on staging before production. Test cart, checkout, payment hooks.', 'Unassigned', 'New', 'Yesterday, 18:22', 'Update risk', 88, '{}'),
('i4', 'acme', 'SSL certificate expires in 9 days', 'high', 'Browser warnings imminent', 'Security', '*.acmefinance.co.za', 'Renew Let''s Encrypt cert via host. Verify auto-renew cron is active.', 'S. Khumalo', 'New', 'Today, 04:00', 'Cert expiry', 100, '{}'),
('i5', 'flexcom', 'Unexpected homepage copy change', 'medium', 'Tone-of-voice drift', 'Content', '/', 'Hero subheading changed without ticket. Confirm with editor or revert.', 'M. Patel', 'New', 'Today, 11:02', 'Copy change', 92, '{}'),
('i6', 'acme', 'Layout shift detected on services page', 'medium', 'CLS regression, SEO risk', 'Performance', '/services', 'New embedded video lacks width/height. Add intrinsic dimensions to reserve space.', 'S. Khumalo', 'Investigating', 'Today, 10:48', 'Layout shift', 91, '{}'),
('i7', 'greenfield', 'Tracking script removed', 'medium', 'Conversion data gap', 'Tracking', 'global', 'GTM-XJ8FZP missing from <head>. Verify with marketing if intentional.', 'Unassigned', 'New', 'Today, 08:31', 'Tag change', 97, '{}'),
('i8', 'tarsus', 'JavaScript error spike on checkout page', 'high', 'Drop-off risk', 'JS error', '/checkout', 'Uncaught TypeError in cart.min.js line 412. 28 errors in last hour vs baseline of 2.', 'J. Ndlovu', 'In Progress', 'Today, 07:55', 'Broken component', 95, '{}'),
('i9', 'flexcom', 'Missing image on team page', 'low', 'Visual polish', 'Visual regression', '/about/team', 'Asset /uploads/2024/team-thandi.jpg returns 404. Re-upload or update reference.', 'Unassigned', 'New', 'Yesterday, 16:09', 'Missing image', 100, '{}'),
('i10', 'gentech', 'Security headers weakened', 'high', 'XSS exposure increased', 'Security', 'global', 'Content-Security-Policy ''unsafe-inline'' added in last deploy. Tighten and re-test.', 'S. Khumalo', 'New', 'Today, 02:15', 'Header change', 89, '{}');

-- Seed data for wp_updates
INSERT INTO public.wp_updates (id, site_id, target, "from", "to", risk, priority, notes, flag) VALUES
('w1', 'acme', 'WordPress Core', '6.5.2', '6.6.1', 'low', 'high', 'Security release. Safe to update.', 'Safe update'),
('w2', 'acme', 'WooCommerce', '8.9.2', '9.0.1', 'high', 'high', 'Major version. Custom checkout hooks present.', 'Needs staging test'),
('w3', 'gentech', 'Elementor Pro', '3.21.1', '3.22.0', 'medium', 'medium', 'Template overrides detected.', 'Needs staging test'),
('w4', 'gentech', 'Yoast SEO', '22.7', '22.9', 'low', 'low', 'Minor patch. Translation strings only.', 'Safe update'),
('w5', 'flexcom', 'Advanced Custom Fields', '6.3.0', '6.3.4', 'low', 'medium', 'Field group migration recommended.', 'Safe update'),
('w6', 'tarsus', 'Form-Pro', '4.1.9', '4.2.1', 'high', 'critical', 'Currently rolled back due to submission failures.', 'Do not update'),
('w7', 'tarsus', 'WordPress Core', '6.5.1', '6.6.1', 'medium', 'high', 'Two minor versions behind. Test admin custom workflows.', 'Needs staging test'),
('w8', 'flexcom', 'Astra Theme', '4.6.10', '4.7.2', 'low', 'low', 'No child theme conflicts detected.', 'Safe update');

-- Seed data for activities
INSERT INTO public.activities (time, site_name, text, sev, type) VALUES
('09:14', 'Acme Finance', 'Visual regression on /  · mobile hero CTA missing', 'crit', 'visual'),
('08:31', 'Greenfield Estates', 'Tracking script GTM-XJ8FZP removed from <head>', 'med', 'tag'),
('07:55', 'Tarsus Cloud Portal', 'JavaScript error rate ↑ 1400% on /checkout', 'high', 'js'),
('06:42', 'Tarsus Cloud Portal', 'Form submissions returning HTTP 500', 'crit', 'form'),
('04:00', 'Acme Finance', 'SSL certificate expires in 9 days', 'high', 'ssl'),
('02:15', 'Gentech Industries', 'Content-Security-Policy weakened in last deploy', 'high', 'sec'),
('Yesterday', 'Flexcom Recruitment', 'Missing image: /uploads/2024/team-thandi.jpg', 'low', 'asset'),
('Yesterday', 'Gentech Industries', 'WooCommerce 9.0 update available · compatibility risk', 'high', 'wp');
