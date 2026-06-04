-- 022_create_social_content_reports_and_hides.sql

CREATE TABLE IF NOT EXISTS social_content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'reel', 'product')),
  content_id UUID NOT NULL,
  reason VARCHAR(50) NOT NULL,
  details TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content_type, content_id)
);

CREATE TABLE IF NOT EXISTS social_content_hides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'reel', 'product')),
  content_id UUID NOT NULL,
  reason VARCHAR(30) NOT NULL CHECK (reason IN ('hide', 'not_interested')),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_social_content_reports_user_created
ON social_content_reports(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_content_reports_content_created
ON social_content_reports(content_type, content_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_content_reports_status_created
ON social_content_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_content_hides_user_reason
ON social_content_hides(user_id, reason, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_content_hides_user_content
ON social_content_hides(user_id, content_type, content_id);

CREATE INDEX IF NOT EXISTS idx_social_content_hides_expires_at
ON social_content_hides(expires_at);

DROP TRIGGER IF EXISTS trigger_social_content_reports_updated_at ON social_content_reports;
CREATE TRIGGER trigger_social_content_reports_updated_at
BEFORE UPDATE ON social_content_reports
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_content_hides_updated_at ON social_content_hides;
CREATE TRIGGER trigger_social_content_hides_updated_at
BEFORE UPDATE ON social_content_hides
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_content_hides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own social content reports" ON social_content_reports;
CREATE POLICY "Users can insert own social content reports"
  ON social_content_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own social content reports" ON social_content_reports;
CREATE POLICY "Users can view own social content reports"
  ON social_content_reports FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own social content hides" ON social_content_hides;
CREATE POLICY "Users can insert own social content hides"
  ON social_content_hides FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own social content hides" ON social_content_hides;
CREATE POLICY "Users can update own social content hides"
  ON social_content_hides FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own social content hides" ON social_content_hides;
CREATE POLICY "Users can delete own social content hides"
  ON social_content_hides FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own social content hides" ON social_content_hides;
CREATE POLICY "Users can view own social content hides"
  ON social_content_hides FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social content reports" ON social_content_reports;
CREATE POLICY "Service role full access social content reports"
  ON social_content_reports FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social content hides" ON social_content_hides;
CREATE POLICY "Service role full access social content hides"
  ON social_content_hides FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

