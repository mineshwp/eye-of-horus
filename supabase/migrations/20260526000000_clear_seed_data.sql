-- Clear all demo seed data injected during initial migrations.
-- The user will add their real clients, sites, and issues directly.

DELETE FROM public.activities;
DELETE FROM public.wp_updates;
DELETE FROM public.issues;
DELETE FROM public.clients;
DELETE FROM public.sites;
