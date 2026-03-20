-- 031_create_social_saved_searches.sql
-- Adds saved search support for unified social discovery.

CREATE TABLE IF NOT EXISTS social_saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL DEFAULT '',
  scope VARCHAR(30) NOT NULL DEFAULT 'all',
  filters JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_saved_searches_user_scope_query
  ON social_saved_searches(user_id, scope, lower(query));

CREATE INDEX IF NOT EXISTS idx_social_saved_searches_user_last_used
  ON social_saved_searches(user_id, last_used_at DESC, created_at DESC);

DROP TRIGGER IF EXISTS trigger_social_saved_searches_updated_at ON social_saved_searches;
CREATE TRIGGER trigger_social_saved_searches_updated_at
BEFORE UPDATE ON social_saved_searches
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social saved searches" ON social_saved_searches;
CREATE POLICY "Users can view own social saved searches"
  ON social_saved_searches FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own social saved searches" ON social_saved_searches;
CREATE POLICY "Users can manage own social saved searches"
  ON social_saved_searches FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social saved searches" ON social_saved_searches;
CREATE POLICY "Service role full access social saved searches"
  ON social_saved_searches FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
