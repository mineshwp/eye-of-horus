-- Remove the Business tab feature: drop the business_inputs table.
-- The CASCADE clears the RLS policies and the site_id foreign key with it.
DROP TABLE IF EXISTS public.business_inputs CASCADE;
