-- 033_create_social_live_sessions.sql
-- Adds Live sessions, pinned products, chat messages, and reactions.

CREATE TABLE IF NOT EXISTS social_live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT,
  cover_image_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'ended')),
  playback_url TEXT,
  viewer_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_live_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES social_live_sessions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  pinned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (session_id, product_id)
);

CREATE TABLE IF NOT EXISTS social_live_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES social_live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_live_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES social_live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(10) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_live_sessions_host
  ON social_live_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_social_live_sessions_status
  ON social_live_sessions(status, started_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_live_products_session
  ON social_live_products(session_id, position, pinned_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_live_messages_session
  ON social_live_messages(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_live_reactions_session
  ON social_live_reactions(session_id, created_at DESC);

DROP TRIGGER IF EXISTS trigger_social_live_sessions_updated_at ON social_live_sessions;
CREATE TRIGGER trigger_social_live_sessions_updated_at
BEFORE UPDATE ON social_live_sessions
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_live_messages_updated_at ON social_live_messages;
CREATE TRIGGER trigger_social_live_messages_updated_at
BEFORE UPDATE ON social_live_messages
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_live_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_live_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_live_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view live sessions" ON social_live_sessions;
CREATE POLICY "Public can view live sessions"
  ON social_live_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Hosts can manage own live sessions" ON social_live_sessions;
CREATE POLICY "Hosts can manage own live sessions"
  ON social_live_sessions FOR ALL
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Service role full access live sessions" ON social_live_sessions;
CREATE POLICY "Service role full access live sessions"
  ON social_live_sessions FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Public can view live products" ON social_live_products;
CREATE POLICY "Public can view live products"
  ON social_live_products FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Hosts can manage live products" ON social_live_products;
CREATE POLICY "Hosts can manage live products"
  ON social_live_products FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM social_live_sessions sls
      WHERE sls.id = social_live_products.session_id
        AND sls.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM social_live_sessions sls
      WHERE sls.id = social_live_products.session_id
        AND sls.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access live products" ON social_live_products;
CREATE POLICY "Service role full access live products"
  ON social_live_products FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Public can view live messages" ON social_live_messages;
CREATE POLICY "Public can view live messages"
  ON social_live_messages FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can create own live messages" ON social_live_messages;
CREATE POLICY "Users can create own live messages"
  ON social_live_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own live messages" ON social_live_messages;
CREATE POLICY "Users can update own live messages"
  ON social_live_messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own live messages" ON social_live_messages;
CREATE POLICY "Users can delete own live messages"
  ON social_live_messages FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access live messages" ON social_live_messages;
CREATE POLICY "Service role full access live messages"
  ON social_live_messages FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Public can view live reactions" ON social_live_reactions;
CREATE POLICY "Public can view live reactions"
  ON social_live_reactions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can create own live reactions" ON social_live_reactions;
CREATE POLICY "Users can create own live reactions"
  ON social_live_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own live reactions" ON social_live_reactions;
CREATE POLICY "Users can delete own live reactions"
  ON social_live_reactions FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access live reactions" ON social_live_reactions;
CREATE POLICY "Service role full access live reactions"
  ON social_live_reactions FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
