CREATE TABLE IF NOT EXISTS social_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_received BOOLEAN NOT NULL DEFAULT true,
  proposal_accepted BOOLEAN NOT NULL DEFAULT true,
  proposal_rejected BOOLEAN NOT NULL DEFAULT true,
  shipped_update BOOLEAN NOT NULL DEFAULT true,
  delivered_update BOOLEAN NOT NULL DEFAULT true,
  swap_completed BOOLEAN NOT NULL DEFAULT true,
  rating_review BOOLEAN NOT NULL DEFAULT true,
  new_follower BOOLEAN NOT NULL DEFAULT true,
  listing_expiring BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_notifications_user_created ON social_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_notifications_user_unread ON social_notifications(user_id, is_read, created_at DESC);

ALTER TABLE social_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own social notifications" ON social_notifications;
CREATE POLICY "Users read own social notifications"
  ON social_notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own social notifications" ON social_notifications;
CREATE POLICY "Users update own social notifications"
  ON social_notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own social notification preferences" ON social_notification_preferences;
CREATE POLICY "Users read own social notification preferences"
  ON social_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own social notification preferences" ON social_notification_preferences;
CREATE POLICY "Users update own social notification preferences"
  ON social_notification_preferences FOR ALL
  USING (auth.uid() = user_id);
