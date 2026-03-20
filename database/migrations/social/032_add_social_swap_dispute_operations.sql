-- 032_add_social_swap_dispute_operations.sql
-- Adds threaded dispute communication, evidence, and ops SLA fields.

ALTER TABLE social_swap_disputes
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_swap_disputes_priority_check'
  ) THEN
    ALTER TABLE social_swap_disputes
      ADD CONSTRAINT social_swap_disputes_priority_check
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS social_swap_dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES social_swap_disputes(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES social_swap_transactions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  message_type VARCHAR(20) NOT NULL DEFAULT 'comment',
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_swap_dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES social_swap_disputes(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES social_swap_transactions(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type VARCHAR(30),
  note TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_swap_disputes_status_sla
  ON social_swap_disputes(status, sla_due_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_dispute_messages_dispute_created
  ON social_swap_dispute_messages(dispute_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_social_swap_dispute_evidence_dispute_created
  ON social_swap_dispute_evidence(dispute_id, created_at ASC);

DROP TRIGGER IF EXISTS trigger_social_swap_dispute_messages_updated_at ON social_swap_dispute_messages;
CREATE TRIGGER trigger_social_swap_dispute_messages_updated_at
BEFORE UPDATE ON social_swap_dispute_messages
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_swap_dispute_evidence_updated_at ON social_swap_dispute_evidence;
CREATE TRIGGER trigger_social_swap_dispute_evidence_updated_at
BEFORE UPDATE ON social_swap_dispute_evidence
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_swap_dispute_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_dispute_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view social swap dispute messages" ON social_swap_dispute_messages;
CREATE POLICY "Participants can view social swap dispute messages"
  ON social_swap_dispute_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM social_swap_transactions sst
      WHERE sst.id = social_swap_dispute_messages.transaction_id
        AND (sst.owner_id = auth.uid() OR sst.proposer_id = auth.uid())
    )
    AND is_internal = false
  );

DROP POLICY IF EXISTS "Participants can create social swap dispute messages" ON social_swap_dispute_messages;
CREATE POLICY "Participants can create social swap dispute messages"
  ON social_swap_dispute_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM social_swap_transactions sst
      WHERE sst.id = social_swap_dispute_messages.transaction_id
        AND (sst.owner_id = auth.uid() OR sst.proposer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role full access social swap dispute messages" ON social_swap_dispute_messages;
CREATE POLICY "Service role full access social swap dispute messages"
  ON social_swap_dispute_messages FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Participants can view social swap dispute evidence" ON social_swap_dispute_evidence;
CREATE POLICY "Participants can view social swap dispute evidence"
  ON social_swap_dispute_evidence FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM social_swap_transactions sst
      WHERE sst.id = social_swap_dispute_evidence.transaction_id
        AND (sst.owner_id = auth.uid() OR sst.proposer_id = auth.uid())
    )
    AND is_internal = false
  );

DROP POLICY IF EXISTS "Participants can create social swap dispute evidence" ON social_swap_dispute_evidence;
CREATE POLICY "Participants can create social swap dispute evidence"
  ON social_swap_dispute_evidence FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM social_swap_transactions sst
      WHERE sst.id = social_swap_dispute_evidence.transaction_id
        AND (sst.owner_id = auth.uid() OR sst.proposer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role full access social swap dispute evidence" ON social_swap_dispute_evidence;
CREATE POLICY "Service role full access social swap dispute evidence"
  ON social_swap_dispute_evidence FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
