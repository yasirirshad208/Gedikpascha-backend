-- 003_create_social_retail_import_bridge.sql

CREATE TABLE IF NOT EXISTS social_retail_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  retail_order_id UUID NOT NULL REFERENCES retail_orders(id) ON DELETE CASCADE,
  retail_order_item_id UUID NOT NULL REFERENCES retail_order_items(id) ON DELETE CASCADE,
  retail_product_id UUID REFERENCES retail_products(id) ON DELETE SET NULL,
  social_product_id UUID REFERENCES social_products(id) ON DELETE SET NULL,

  purchased_quantity INTEGER NOT NULL CHECK (purchased_quantity > 0),
  imported_quantity INTEGER NOT NULL DEFAULT 0 CHECK (imported_quantity >= 0),

  source_snapshot JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, retail_order_item_id),
  CONSTRAINT social_retail_import_quantity_guard CHECK (imported_quantity <= purchased_quantity)
);

CREATE TABLE IF NOT EXISTS social_retail_import_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES social_retail_imports(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  quantity INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_retail_imports_user ON social_retail_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_social_retail_imports_order_item ON social_retail_imports(retail_order_item_id);
CREATE INDEX IF NOT EXISTS idx_social_retail_imports_social_product ON social_retail_imports(social_product_id);
CREATE INDEX IF NOT EXISTS idx_social_retail_import_events_import_id ON social_retail_import_events(import_id);

DROP TRIGGER IF EXISTS trigger_social_retail_imports_updated_at ON social_retail_imports;
CREATE TRIGGER trigger_social_retail_imports_updated_at
BEFORE UPDATE ON social_retail_imports
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

CREATE OR REPLACE FUNCTION social_retail_import_remaining_qty(
  p_user_id UUID,
  p_retail_order_item_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  purchased_qty INTEGER;
  imported_qty INTEGER;
BEGIN
  SELECT roi.quantity
    INTO purchased_qty
  FROM retail_order_items roi
  JOIN retail_orders ro ON ro.id = roi.order_id
  WHERE roi.id = p_retail_order_item_id
    AND ro.user_id = p_user_id
    AND ro.status IN ('delivered', 'completed')
    AND ro.status NOT IN ('cancelled', 'refunded')
  LIMIT 1;

  IF purchased_qty IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(sri.imported_quantity), 0)
    INTO imported_qty
  FROM social_retail_imports sri
  WHERE sri.user_id = p_user_id
    AND sri.retail_order_item_id = p_retail_order_item_id;

  RETURN GREATEST(0, purchased_qty - COALESCE(imported_qty, 0));
END;
$$ LANGUAGE plpgsql STABLE;

ALTER TABLE social_retail_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_retail_import_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social retail imports" ON social_retail_imports;
CREATE POLICY "Users can view own social retail imports"
  ON social_retail_imports FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own social retail imports" ON social_retail_imports;
CREATE POLICY "Users can insert own social retail imports"
  ON social_retail_imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own social retail imports" ON social_retail_imports;
CREATE POLICY "Users can update own social retail imports"
  ON social_retail_imports FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social retail imports" ON social_retail_imports;
CREATE POLICY "Service role full access social retail imports"
  ON social_retail_imports FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Users can view own social retail import events" ON social_retail_import_events;
CREATE POLICY "Users can view own social retail import events"
  ON social_retail_import_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_retail_imports sri
      WHERE sri.id = social_retail_import_events.import_id
      AND sri.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access social retail import events" ON social_retail_import_events;
CREATE POLICY "Service role full access social retail import events"
  ON social_retail_import_events FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
