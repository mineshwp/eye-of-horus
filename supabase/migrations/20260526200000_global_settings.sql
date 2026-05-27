-- Global admin settings — stores platform-wide API keys that override environment variables.
-- Super admin access only. Values are stored as text and must be masked in the UI.

CREATE TABLE IF NOT EXISTS global_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- Only authenticated users (super admins) can read/write global settings.
-- Fine-grained role enforcement is done in the API route layer.
CREATE POLICY "Auth users can manage global_settings" ON global_settings
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Seed the expected keys so GET returns all rows even before first save.
INSERT INTO global_settings (key, value) VALUES
  ('openai_api_key', null),
  ('email_provider', null),
  ('email_api_key', null),
  ('email_from_address', null),
  ('twilio_account_sid', null),
  ('twilio_auth_token', null),
  ('twilio_whatsapp_from', null)
ON CONFLICT (key) DO NOTHING;
