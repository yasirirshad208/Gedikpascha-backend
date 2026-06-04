-- 009_create_social_notifications_tables.sql

CREATE TABLE IF NOT EXISTS social_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  body TEXT,
  metadata JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  proposal_received BOOLEAN NOT NULL DEFAULT true,
  proposal_accepted BOOLEAN NOT NULL DEFAULT true,
  proposal_declined BOOLEAN NOT NULL DEFAULT true,
  shipment_updates BOOLEAN NOT NULL DEFAULT true,
  swap_completed BOOLEAN NOT NULL DEFAULT true,
  new_followers BOOLEAN NOT NULL DEFAULT true,
  likes_comments BOOLEAN NOT NULL DEFAULT true,
  messages BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_notifications_user_created ON social_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_notifications_user_unread ON social_notifications(user_id, is_read, created_at DESC);

DROP TRIGGER IF EXISTS trigger_social_notification_preferences_updated_at ON social_notification_preferences;
CREATE TRIGGER trigger_social_notification_preferences_updated_at
BEFORE UPDATE ON social_notification_preferences
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

CREATE OR REPLACE FUNCTION social_create_notification(
  p_user_id UUID,
  p_type VARCHAR,
  p_title VARCHAR,
  p_body TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO social_notifications (user_id, type, title, body, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, COALESCE(p_metadata, '{}'::JSONB))
  RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION social_ensure_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO social_notification_preferences (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_ensure_notification_preferences ON social_profiles;
CREATE TRIGGER trigger_social_ensure_notification_preferences
AFTER INSERT ON social_profiles
FOR EACH ROW
EXECUTE FUNCTION social_ensure_notification_preferences();

INSERT INTO social_notification_preferences (user_id)
SELECT sp.user_id
FROM social_profiles sp
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE social_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social notifications" ON social_notifications;
CREATE POLICY "Users can view own social notifications"
  ON social_notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own social notifications" ON social_notifications;
CREATE POLICY "Users can update own social notifications"
  ON social_notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social notifications" ON social_notifications;
CREATE POLICY "Service role full access social notifications"
  ON social_notifications FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Users can view own social notification preferences" ON social_notification_preferences;
CREATE POLICY "Users can view own social notification preferences"
  ON social_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own social notification preferences" ON social_notification_preferences;
CREATE POLICY "Users can update own social notification preferences"
  ON social_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social notification preferences" ON social_notification_preferences;
CREATE POLICY "Service role full access social notification preferences"
  ON social_notification_preferences FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
