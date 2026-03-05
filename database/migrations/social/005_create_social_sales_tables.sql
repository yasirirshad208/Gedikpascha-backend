CREATE TABLE IF NOT EXISTS social_sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(30) UNIQUE,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_name VARCHAR(255),
  shipping_phone VARCHAR(60),
  shipping_address_line1 VARCHAR(255),
  shipping_address_line2 VARCHAR(255),
  shipping_city VARCHAR(120),
  shipping_state VARCHAR(120),
  shipping_postal_code VARCHAR(30),
  shipping_country VARCHAR(120),
  tracking_number VARCHAR(120),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT social_sales_status CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded')),
  CONSTRAINT social_sales_payment_status CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'))
);

CREATE TABLE IF NOT EXISTS social_sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES social_sales_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES social_products(id) ON DELETE SET NULL,
  product_title VARCHAR(255) NOT NULL,
  product_image TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  item_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_sales_item_quantity CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_social_sales_orders_buyer ON social_sales_orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_sales_orders_seller ON social_sales_orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_sales_orders_status ON social_sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_social_sales_order_items_order ON social_sales_order_items(order_id);

CREATE OR REPLACE FUNCTION social_generate_order_number()
RETURNS TEXT AS $$
DECLARE
  suffix TEXT;
BEGIN
  suffix := TO_CHAR(NOW(), 'YYMMDD') || LPAD((FLOOR(RANDOM() * 9999)::INT)::TEXT, 4, '0');
  RETURN 'SO' || suffix;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION social_set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := social_generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_set_order_number ON social_sales_orders;
CREATE TRIGGER trg_social_set_order_number
BEFORE INSERT ON social_sales_orders
FOR EACH ROW
EXECUTE FUNCTION social_set_order_number();

ALTER TABLE social_sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_sales_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own social sales orders" ON social_sales_orders;
CREATE POLICY "Users read own social sales orders"
  ON social_sales_orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users insert own social sales orders" ON social_sales_orders;
CREATE POLICY "Users insert own social sales orders"
  ON social_sales_orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users read own social sales items" ON social_sales_order_items;
CREATE POLICY "Users read own social sales items"
  ON social_sales_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_sales_orders o
      WHERE o.id = social_sales_order_items.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );
