-- Phase 7: AI Layer — ai_messages table
-- Stores all AI-generated content: summaries, issue analysis, chat, SEO briefs

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES sites(id) ON DELETE CASCADE,
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  message_type varchar(30) NOT NULL DEFAULT 'chat'
    CHECK (message_type IN ('chat', 'summary', 'issue_analysis', 'seo_brief', 'fix_recommendation')),
  question text,
  answer text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  model varchar(60),
  tokens_used integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_messages_site_id_idx ON ai_messages(site_id);
CREATE INDEX IF NOT EXISTS ai_messages_created_at_idx ON ai_messages(created_at DESC);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read ai_messages" ON ai_messages
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage ai_messages" ON ai_messages
  FOR ALL USING (true);
