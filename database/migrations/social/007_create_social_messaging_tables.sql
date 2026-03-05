CREATE TABLE IF NOT EXISTS social_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  related_swap_transaction_id UUID REFERENCES social_swap_transactions(id) ON DELETE SET NULL,
  title VARCHAR(255),
  last_message_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_thread_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES social_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_thread_participants_unique UNIQUE (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES social_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type VARCHAR(30) NOT NULL DEFAULT 'text',
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_message_type CHECK (message_type IN ('text', 'product_card', 'shipping_card', 'review_card', 'system'))
);

CREATE TABLE IF NOT EXISTS social_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES social_messages(id) ON DELETE CASCADE,
  attachment_type VARCHAR(30) NOT NULL,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_message_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES social_threads(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text VARCHAR(180) NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_threads_updated ON social_threads(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_thread_participants_user ON social_thread_participants(user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_social_messages_thread ON social_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_social_message_events_thread ON social_message_events(thread_id, created_at DESC);

ALTER TABLE social_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_message_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read threads where participant" ON social_threads;
CREATE POLICY "Users read threads where participant"
  ON social_threads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_thread_participants p
      WHERE p.thread_id = social_threads.id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users update threads where participant" ON social_threads;
CREATE POLICY "Users update threads where participant"
  ON social_threads FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM social_thread_participants p
      WHERE p.thread_id = social_threads.id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users read participants in own thread" ON social_thread_participants;
CREATE POLICY "Users read participants in own thread"
  ON social_thread_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_thread_participants p
      WHERE p.thread_id = social_thread_participants.thread_id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert own participant row" ON social_thread_participants;
CREATE POLICY "Users insert own participant row"
  ON social_thread_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read messages in own thread" ON social_messages;
CREATE POLICY "Users read messages in own thread"
  ON social_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_thread_participants p
      WHERE p.thread_id = social_messages.thread_id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users send messages in own thread" ON social_messages;
CREATE POLICY "Users send messages in own thread"
  ON social_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM social_thread_participants p
      WHERE p.thread_id = social_messages.thread_id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users read quick replies" ON social_quick_replies;
CREATE POLICY "Users read quick replies" ON social_quick_replies FOR SELECT USING (true);
