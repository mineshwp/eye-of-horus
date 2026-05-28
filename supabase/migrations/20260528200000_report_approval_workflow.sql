-- Report Approval Workflow
-- Extends the reports.status column to support the full approval flow:
--   generating → draft → pending_approval → approved
--   (error remains for failed generation)
-- Only approved reports are visible to clients in the portal.

-- Drop the existing check constraint and re-add with expanded statuses.
ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_status_check;

ALTER TABLE reports
  ADD CONSTRAINT reports_status_check
    CHECK (status IN ('generating', 'draft', 'pending_approval', 'approved', 'rejected', 'error', 'ready'));

-- Migrate existing 'ready' rows to 'draft' so they go through the approval flow.
-- If you want to treat all previously-ready reports as already approved, change 'draft' → 'approved'.
UPDATE reports SET status = 'draft' WHERE status = 'ready';

-- Add reviewed_by and reviewed_at columns for the audit trail.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- RLS: Clients can only read approved reports.
-- Existing policy (if any) must allow approved reports.
-- Drop and recreate the select policy to enforce this.
DROP POLICY IF EXISTS "reports_select" ON reports;

CREATE POLICY "reports_select" ON reports
  FOR SELECT
  USING (
    -- Service role sees everything
    auth.uid() IS NULL
    OR
    -- Admins (super_admin / admin) see everything
    (SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('super_admin', 'admin')
    OR
    -- Clients only see approved reports for their assigned clients
    (
      status = 'approved'
      AND client_id IN (
        SELECT client_id FROM client_users WHERE user_id = auth.uid()
      )
    )
  );

-- Allow admins to update report status (for approval/rejection).
DROP POLICY IF EXISTS "reports_update_status" ON reports;

CREATE POLICY "reports_update_status" ON reports
  FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('super_admin', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('super_admin', 'admin')
  );
