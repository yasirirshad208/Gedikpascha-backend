-- 034_enhance_social_live_provider_presence.sql
-- Adds provider-backed live metadata, viewer presence tracking, and status transition guardrails.

ALTER TABLE social_live_sessions
  ADD COLUMN IF NOT EXISTS provider VARCHAR(30) NOT NULL DEFAULT 'livekit',
  ADD COLUMN IF NOT EXISTS provider_room_id TEXT,
  ADD COLUMN IF NOT EXISTS playback_hls_url TEXT,
  ADD COLUMN IF NOT EXISTS replay_url TEXT,
  ADD COLUMN IF NOT EXISTS replay_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cover_media_path TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_live_sessions_provider_check'
  ) THEN
    ALTER TABLE social_live_sessions
      ADD CONSTRAINT social_live_sessions_provider_check
      CHECK (provider IN ('livekit', 'mock'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_live_sessions_viewer_count_nonnegative_check'
  ) THEN
    ALTER TABLE social_live_sessions
      ADD CONSTRAINT social_live_sessions_viewer_count_nonnegative_check
      CHECK (viewer_count >= 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION social_validate_live_session_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'scheduled' AND NEW.status <> 'live' THEN
      RAISE EXCEPTION 'Invalid social_live_sessions transition: % -> %', OLD.status, NEW.status;
    ELSIF OLD.status = 'live' AND NEW.status <> 'ended' THEN
      RAISE EXCEPTION 'Invalid social_live_sessions transition: % -> %', OLD.status, NEW.status;
    ELSIF OLD.status = 'ended' AND NEW.status <> 'ended' THEN
      RAISE EXCEPTION 'Invalid social_live_sessions transition: % -> %', OLD.status, NEW.status;
    END IF;

    NEW.status_changed_at = NOW();

    IF NEW.status = 'live' AND NEW.started_at IS NULL THEN
      NEW.started_at = NOW();
    END IF;

    IF NEW.status = 'ended' AND NEW.ended_at IS NULL THEN
      NEW.ended_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_social_live_sessions_status_transition ON social_live_sessions;
CREATE TRIGGER trigger_social_live_sessions_status_transition
BEFORE UPDATE OF status ON social_live_sessions
FOR EACH ROW
EXECUTE FUNCTION social_validate_live_session_transition();

CREATE TABLE IF NOT EXISTS social_live_viewers (
  session_id UUID NOT NULL REFERENCES social_live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_live_viewers_session_active
  ON social_live_viewers(session_id, left_at, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_live_viewers_user
  ON social_live_viewers(user_id, last_seen_at DESC);

DROP TRIGGER IF EXISTS trigger_social_live_viewers_updated_at ON social_live_viewers;
CREATE TRIGGER trigger_social_live_viewers_updated_at
BEFORE UPDATE ON social_live_viewers
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_live_viewers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view live viewers" ON social_live_viewers;
CREATE POLICY "Public can view live viewers"
  ON social_live_viewers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can create own live viewer presence" ON social_live_viewers;
CREATE POLICY "Users can create own live viewer presence"
  ON social_live_viewers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own live viewer presence" ON social_live_viewers;
CREATE POLICY "Users can update own live viewer presence"
  ON social_live_viewers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own live viewer presence" ON social_live_viewers;
CREATE POLICY "Users can delete own live viewer presence"
  ON social_live_viewers FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access live viewers" ON social_live_viewers;
CREATE POLICY "Service role full access live viewers"
  ON social_live_viewers FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
