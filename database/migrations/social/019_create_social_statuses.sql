-- 019_create_social_statuses.sql

CREATE TABLE IF NOT EXISTS social_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'video')),
  thumbnail_url TEXT,
  caption TEXT,
  duration_seconds INTEGER,
  views_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT social_statuses_expiry_window CHECK (
    expires_at > created_at
    AND expires_at <= created_at + INTERVAL '24 hours'
  )
);

CREATE TABLE IF NOT EXISTS social_status_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id UUID NOT NULL REFERENCES social_statuses(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (status_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_social_statuses_user_created
  ON social_statuses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_statuses_expires_at
  ON social_statuses(expires_at);

CREATE INDEX IF NOT EXISTS idx_social_status_views_status
  ON social_status_views(status_id);

CREATE INDEX IF NOT EXISTS idx_social_status_views_viewer
  ON social_status_views(viewer_id, created_at DESC);

DROP TRIGGER IF EXISTS trigger_social_statuses_updated_at ON social_statuses;
CREATE TRIGGER trigger_social_statuses_updated_at
BEFORE UPDATE ON social_statuses
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

CREATE OR REPLACE FUNCTION social_refresh_status_views_count()
RETURNS TRIGGER AS $$
DECLARE
  target_status_id UUID;
BEGIN
  target_status_id := COALESCE(NEW.status_id, OLD.status_id);

  UPDATE social_statuses
  SET views_count = (
    SELECT COUNT(*)
    FROM social_status_views
    WHERE status_id = target_status_id
  )
  WHERE id = target_status_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_refresh_status_views_count ON social_status_views;
CREATE TRIGGER trigger_social_refresh_status_views_count
AFTER INSERT OR DELETE ON social_status_views
FOR EACH ROW
EXECUTE FUNCTION social_refresh_status_views_count();

ALTER TABLE social_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_status_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active social statuses" ON social_statuses;
CREATE POLICY "Public can view active social statuses"
  ON social_statuses FOR SELECT
  USING (expires_at > NOW());

DROP POLICY IF EXISTS "Users can view own social statuses" ON social_statuses;
CREATE POLICY "Users can view own social statuses"
  ON social_statuses FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own social statuses" ON social_statuses;
CREATE POLICY "Users can insert own social statuses"
  ON social_statuses FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND expires_at <= NOW() + INTERVAL '24 hours'
    AND expires_at > NOW()
  );

DROP POLICY IF EXISTS "Users can update own social statuses" ON social_statuses;
CREATE POLICY "Users can update own social statuses"
  ON social_statuses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own social statuses" ON social_statuses;
CREATE POLICY "Users can delete own social statuses"
  ON social_statuses FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social statuses" ON social_statuses;
CREATE POLICY "Service role full access social statuses"
  ON social_statuses FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Users can view own social status views" ON social_status_views;
CREATE POLICY "Users can view own social status views"
  ON social_status_views FOR SELECT
  USING (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Users can insert own social status views" ON social_status_views;
CREATE POLICY "Users can insert own social status views"
  ON social_status_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Users can delete own social status views" ON social_status_views;
CREATE POLICY "Users can delete own social status views"
  ON social_status_views FOR DELETE
  USING (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Service role full access social status views" ON social_status_views;
CREATE POLICY "Service role full access social status views"
  ON social_status_views FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
