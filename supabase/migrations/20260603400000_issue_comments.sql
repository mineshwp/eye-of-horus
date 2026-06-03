-- Migration: issue comments (Phase 2 — internal issue workflow)
-- Persists the per-issue notes/comments thread that was previously in-memory only.
-- Issues themselves are the task list; status (Resolved/Ignored) is the "tick complete".

CREATE TABLE IF NOT EXISTS issue_comments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id     text        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_email text,
  author_name  text,
  body         text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Comments are read newest-or-oldest per issue; index by issue.
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue
  ON issue_comments (issue_id, created_at);

ALTER TABLE issue_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read issue comments"
  ON issue_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can add issue comments"
  ON issue_comments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Service role full access to issue comments"
  ON issue_comments FOR ALL TO service_role USING (true) WITH CHECK (true);
