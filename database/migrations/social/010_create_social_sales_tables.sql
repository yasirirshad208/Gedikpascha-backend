-- 010_create_social_sales_tables.sql

CREATE TABLE IF NOT EXISTS social_sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(30) NOT NULL UNIQUE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'packing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded')),

  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',

  shipping_address JSONB,
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  shipped_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS social_sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES social_sales_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES social_products(id) ON DELETE SET NULL,
  product_snapshot JSONB NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
  total_price DECIMAL(12,2) NOT NULL CHECK (total_price >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_sales_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES social_sales_orders(id) ON DELETE CASCADE,
  shipper_id UUID REFERENCES users(id) ON DELETE SET NULL,
  carrier VARCHAR(120),
  tracking_number VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'label_created' CHECK (status IN ('label_created', 'in_transit', 'delivered', 'failed')),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_sales_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES social_sales_orders(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_sales_orders_buyer ON social_sales_orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_sales_orders_seller ON social_sales_orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_sales_orders_status ON social_sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_social_sales_order_items_order ON social_sales_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_social_sales_shipments_order ON social_sales_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_social_sales_events_order ON social_sales_events(order_id, created_at DESC);

DROP TRIGGER IF EXISTS trigger_social_sales_orders_updated_at ON social_sales_orders;
CREATE TRIGGER trigger_social_sales_orders_updated_at
BEFORE UPDATE ON social_sales_orders
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_sales_shipments_updated_at ON social_sales_shipments;
CREATE TRIGGER trigger_social_sales_shipments_updated_at
BEFORE UPDATE ON social_sales_shipments
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

CREATE OR REPLACE FUNCTION social_generate_sales_order_number()
RETURNS TEXT AS $$
DECLARE
  prefix TEXT := 'SO';
  date_part TEXT := TO_CHAR(NOW(), 'YYMMDD');
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 9) AS INTEGER)), 0) + 1
    INTO seq_num
  FROM social_sales_orders
  WHERE order_number LIKE prefix || date_part || '%';

  RETURN prefix || date_part || LPAD(seq_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION social_set_sales_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := social_generate_sales_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_set_sales_order_number ON social_sales_orders;
CREATE TRIGGER trigger_social_set_sales_order_number
BEFORE INSERT ON social_sales_orders
FOR EACH ROW
EXECUTE FUNCTION social_set_sales_order_number();

ALTER TABLE social_sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_sales_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_sales_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social sales orders" ON social_sales_orders;
CREATE POLICY "Users can view own social sales orders"
  ON social_sales_orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Buyer can create social sales orders" ON social_sales_orders;
CREATE POLICY "Buyer can create social sales orders"
  ON social_sales_orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Participants can update social sales orders" ON social_sales_orders;
CREATE POLICY "Participants can update social sales orders"
  ON social_sales_orders FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Participants can view social sales order items" ON social_sales_order_items;
CREATE POLICY "Participants can view social sales order items"
  ON social_sales_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_sales_orders sso
      WHERE sso.id = social_sales_order_items.order_id
      AND (sso.buyer_id = auth.uid() OR sso.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Buyer can insert social sales order items" ON social_sales_order_items;
CREATE POLICY "Buyer can insert social sales order items"
  ON social_sales_order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_sales_orders sso
      WHERE sso.id = social_sales_order_items.order_id
      AND sso.buyer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants can view social sales shipments" ON social_sales_shipments;
CREATE POLICY "Participants can view social sales shipments"
  ON social_sales_shipments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_sales_orders sso
      WHERE sso.id = social_sales_shipments.order_id
      AND (sso.buyer_id = auth.uid() OR sso.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Seller can manage social sales shipments" ON social_sales_shipments;
CREATE POLICY "Seller can manage social sales shipments"
  ON social_sales_shipments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_sales_orders sso
      WHERE sso.id = social_sales_shipments.order_id
      AND sso.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_sales_orders sso
      WHERE sso.id = social_sales_shipments.order_id
      AND sso.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants can view social sales events" ON social_sales_events;
CREATE POLICY "Participants can view social sales events"
  ON social_sales_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_sales_orders sso
      WHERE sso.id = social_sales_events.order_id
      AND (sso.buyer_id = auth.uid() OR sso.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role full access social sales orders" ON social_sales_orders;
CREATE POLICY "Service role full access social sales orders"
  ON social_sales_orders FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social sales order items" ON social_sales_order_items;
CREATE POLICY "Service role full access social sales order items"
  ON social_sales_order_items FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social sales shipments" ON social_sales_shipments;
CREATE POLICY "Service role full access social sales shipments"
  ON social_sales_shipments FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social sales events" ON social_sales_events;
CREATE POLICY "Service role full access social sales events"
  ON social_sales_events FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
