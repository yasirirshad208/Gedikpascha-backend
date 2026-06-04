-- 008_create_social_messages_tables.sql

CREATE TABLE IF NOT EXISTS social_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255),
  related_swap_listing_id UUID REFERENCES social_swap_listings(id) ON DELETE SET NULL,
  related_swap_transaction_id UUID REFERENCES social_swap_transactions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_message_preview TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_thread_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES social_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP WITH TIME ZONE,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES social_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type VARCHAR(30) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'product_card', 'shipping_card', 'review_card')),
  body TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES social_messages(id) ON DELETE CASCADE,
  attachment_type VARCHAR(30) NOT NULL DEFAULT 'image' CHECK (attachment_type IN ('image', 'video', 'file', 'product')),
  file_url TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_message_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES social_threads(id) ON DELETE CASCADE,
  message_id UUID REFERENCES social_messages(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_threads_last_message_at ON social_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_thread_participants_user ON social_thread_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_social_messages_thread_created ON social_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_message_attachments_message ON social_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_social_message_events_thread ON social_message_events(thread_id, created_at DESC);

DROP TRIGGER IF EXISTS trigger_social_threads_updated_at ON social_threads;
CREATE TRIGGER trigger_social_threads_updated_at
BEFORE UPDATE ON social_threads
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_messages_updated_at ON social_messages;
CREATE TRIGGER trigger_social_messages_updated_at
BEFORE UPDATE ON social_messages
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

CREATE OR REPLACE FUNCTION social_is_thread_participant(p_thread_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM social_thread_participants stp
    WHERE stp.thread_id = p_thread_id
      AND stp.user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION social_sync_thread_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE social_threads
  SET
    last_message_preview = LEFT(COALESCE(NEW.body, NEW.message_type), 200),
    last_message_at = NEW.created_at,
    updated_at = NOW()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_sync_thread_last_message ON social_messages;
CREATE TRIGGER trigger_social_sync_thread_last_message
AFTER INSERT ON social_messages
FOR EACH ROW
EXECUTE FUNCTION social_sync_thread_last_message();

ALTER TABLE social_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_message_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social threads" ON social_threads;
CREATE POLICY "Users can view own social threads"
  ON social_threads FOR SELECT
  USING (social_is_thread_participant(id, auth.uid()));

DROP POLICY IF EXISTS "Users can create social threads" ON social_threads;
CREATE POLICY "Users can create social threads"
  ON social_threads FOR INSERT
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

DROP POLICY IF EXISTS "Participants can update social threads" ON social_threads;
CREATE POLICY "Participants can update social threads"
  ON social_threads FOR UPDATE
  USING (social_is_thread_participant(id, auth.uid()))
  WITH CHECK (social_is_thread_participant(id, auth.uid()));

DROP POLICY IF EXISTS "Users can view own thread participants" ON social_thread_participants;
CREATE POLICY "Users can view own thread participants"
  ON social_thread_participants FOR SELECT
  USING (social_is_thread_participant(thread_id, auth.uid()));

DROP POLICY IF EXISTS "Users can insert own thread participant row" ON social_thread_participants;
CREATE POLICY "Users can insert own thread participant row"
  ON social_thread_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own thread participant row" ON social_thread_participants;
CREATE POLICY "Users can update own thread participant row"
  ON social_thread_participants FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Participants can view thread messages" ON social_messages;
CREATE POLICY "Participants can view thread messages"
  ON social_messages FOR SELECT
  USING (social_is_thread_participant(thread_id, auth.uid()));

DROP POLICY IF EXISTS "Participants can send own thread messages" ON social_messages;
CREATE POLICY "Participants can send own thread messages"
  ON social_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND social_is_thread_participant(thread_id, auth.uid()));

DROP POLICY IF EXISTS "Message sender can update own message" ON social_messages;
CREATE POLICY "Message sender can update own message"
  ON social_messages FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Message sender can delete own message" ON social_messages;
CREATE POLICY "Message sender can delete own message"
  ON social_messages FOR DELETE
  USING (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Participants can view message attachments" ON social_message_attachments;
CREATE POLICY "Participants can view message attachments"
  ON social_message_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM social_messages sm
      WHERE sm.id = social_message_attachments.message_id
        AND social_is_thread_participant(sm.thread_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Message sender can manage message attachments" ON social_message_attachments;
CREATE POLICY "Message sender can manage message attachments"
  ON social_message_attachments FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM social_messages sm
      WHERE sm.id = social_message_attachments.message_id
        AND sm.sender_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM social_messages sm
      WHERE sm.id = social_message_attachments.message_id
        AND sm.sender_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants can view social message events" ON social_message_events;
CREATE POLICY "Participants can view social message events"
  ON social_message_events FOR SELECT
  USING (social_is_thread_participant(thread_id, auth.uid()));

DROP POLICY IF EXISTS "Service role full access social messages" ON social_threads;
CREATE POLICY "Service role full access social messages"
  ON social_threads FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social thread participants" ON social_thread_participants;
CREATE POLICY "Service role full access social thread participants"
  ON social_thread_participants FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social messages rows" ON social_messages;
CREATE POLICY "Service role full access social messages rows"
  ON social_messages FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social message attachments" ON social_message_attachments;
CREATE POLICY "Service role full access social message attachments"
  ON social_message_attachments FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social message events" ON social_message_events;
CREATE POLICY "Service role full access social message events"
  ON social_message_events FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
