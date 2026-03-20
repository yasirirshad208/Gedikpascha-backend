-- 030_create_social_analytics_events.sql
-- Stores non-blocking social analytics events for funnel and reliability tracking.

CREATE TABLE IF NOT EXISTS social_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  event_name VARCHAR(120) NOT NULL,
  route TEXT NULL,
  action VARCHAR(120) NULL,
  status VARCHAR(32) NULL,
  correlation_id VARCHAR(120) NULL,
  retryable BOOLEAN NULL,
  metadata JSONB NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_analytics_events_created_at
  ON social_analytics_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_analytics_events_event_name
  ON social_analytics_events(event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_analytics_events_route
  ON social_analytics_events(route, occurred_at DESC);

ALTER TABLE social_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social analytics events" ON social_analytics_events;
CREATE POLICY "Users can view own social analytics events"
  ON social_analytics_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social analytics events" ON social_analytics_events;
CREATE POLICY "Service role full access social analytics events"
  ON social_analytics_events FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

