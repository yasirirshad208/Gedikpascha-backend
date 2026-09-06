-- ============================================================================
-- 038: Let a live session carry the time it is scheduled for.
--
-- social_live_sessions had status 'scheduled' but no column saying *when*, so
-- the create form had nowhere to store a time and scheduled sessions could
-- only ever show "Upcoming".
--
-- Note: sessions still start manually via the host's "Go live" button. This
-- column is informational (countdown / ordering), not a trigger.
-- ============================================================================

ALTER TABLE social_live_sessions
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_social_live_sessions_scheduled_at
  ON social_live_sessions (scheduled_at)
  WHERE scheduled_at IS NOT NULL;
