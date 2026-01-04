-- Create wholesale_orders table to store orders
CREATE TABLE IF NOT EXISTS wholesale_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(20) NOT NULL UNIQUE,

  -- User info (nullable for guest checkout)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Customer information (stored at time of order for record keeping)
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),

  -- Shipping address
  shipping_address_line1 VARCHAR(255) NOT NULL,
  shipping_address_line2 VARCHAR(255),
  shipping_city VARCHAR(100) NOT NULL,
  shipping_state VARCHAR(100),
  shipping_postal_code VARCHAR(20) NOT NULL,
  shipping_country VARCHAR(100) NOT NULL DEFAULT 'Turkey',

  -- Billing address (optional, can be same as shipping)
  billing_same_as_shipping BOOLEAN NOT NULL DEFAULT true,
  billing_address_line1 VARCHAR(255),
  billing_address_line2 VARCHAR(255),
  billing_city VARCHAR(100),
  billing_state VARCHAR(100),
  billing_postal_code VARCHAR(20),
  billing_country VARCHAR(100),

  -- Order totals
  subtotal DECIMAL(12, 2) NOT NULL,
  shipping_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,

  -- Order counts
  total_items INTEGER NOT NULL DEFAULT 0,
  total_pieces INTEGER NOT NULL DEFAULT 0,

  -- Order status
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- pending, confirmed, processing, shipped, delivered, cancelled, refunded

  -- Payment information
  payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- pending, paid, failed, refunded
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),

  -- Additional info
  notes TEXT,
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  shipped_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT positive_subtotal CHECK (subtotal >= 0),
  CONSTRAINT positive_shipping_cost CHECK (shipping_cost >= 0),
  CONSTRAINT positive_tax_amount CHECK (tax_amount >= 0),
  CONSTRAINT positive_discount_amount CHECK (discount_amount >= 0),
  CONSTRAINT positive_total_amount CHECK (total_amount >= 0),
  CONSTRAINT positive_total_items CHECK (total_items >= 0),
  CONSTRAINT positive_total_pieces CHECK (total_pieces >= 0)
);

-- Create wholesale_order_items table to store order line items
CREATE TABLE IF NOT EXISTS wholesale_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE,

  -- Product reference (can be null if product is deleted)
  product_id UUID REFERENCES wholesale_products(id) ON DELETE SET NULL,
  pack_size_id UUID REFERENCES wholesale_product_pack_sizes(id) ON DELETE SET NULL,

  -- Product info snapshot at time of order (for record keeping)
  product_name VARCHAR(255) NOT NULL,
  product_slug VARCHAR(255),
  product_image TEXT,
  brand_name VARCHAR(255),
  pack_label VARCHAR(100),
  pack_quantity INTEGER NOT NULL DEFAULT 1,

  -- Quantity and pricing
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  pack_price DECIMAL(10, 2) NOT NULL,
  item_total DECIMAL(12, 2) NOT NULL,

  -- Selected variations as JSON
  selected_variations JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT positive_order_item_quantity CHECK (quantity > 0),
  CONSTRAINT positive_order_item_unit_price CHECK (unit_price >= 0),
  CONSTRAINT positive_order_item_pack_price CHECK (pack_price >= 0),
  CONSTRAINT positive_order_item_total CHECK (item_total >= 0)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_user_id ON wholesale_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_order_number ON wholesale_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_status ON wholesale_orders(status);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_payment_status ON wholesale_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_created_at ON wholesale_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_customer_email ON wholesale_orders(customer_email);

CREATE INDEX IF NOT EXISTS idx_wholesale_order_items_order_id ON wholesale_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_order_items_product_id ON wholesale_order_items(product_id);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_wholesale_orders_updated_at
  BEFORE UPDATE ON wholesale_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  prefix TEXT := 'WO';
  date_part TEXT := TO_CHAR(NOW(), 'YYMMDD');
  seq_number INTEGER;
BEGIN
  -- Get the next sequence number for today
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 9) AS INTEGER)), 0) + 1
  INTO seq_number
  FROM wholesale_orders
  WHERE order_number LIKE prefix || date_part || '%';

  new_number := prefix || date_part || LPAD(seq_number::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate order number
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_wholesale_order_number
  BEFORE INSERT ON wholesale_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();

-- Add comments for documentation
COMMENT ON TABLE wholesale_orders IS 'Wholesale orders placed by customers';
COMMENT ON TABLE wholesale_order_items IS 'Line items for each wholesale order';
COMMENT ON COLUMN wholesale_orders.order_number IS 'Unique order number in format WO + YYMMDD + sequence';
COMMENT ON COLUMN wholesale_orders.status IS 'Order status: pending, confirmed, processing, shipped, delivered, cancelled, refunded';
COMMENT ON COLUMN wholesale_orders.payment_status IS 'Payment status: pending, paid, failed, refunded';

-- Enable Row Level Security (RLS)
ALTER TABLE wholesale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_order_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for wholesale_orders
-- Users can view their own orders
CREATE POLICY "Users can view own orders"
  ON wholesale_orders FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Users can insert their own orders
CREATE POLICY "Users can insert own orders"
  ON wholesale_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Service role can do anything (for admin operations)
CREATE POLICY "Service role full access on orders"
  ON wholesale_orders FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create RLS policies for wholesale_order_items
-- Users can view items from their own orders
CREATE POLICY "Users can view own order items"
  ON wholesale_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM wholesale_orders
      WHERE id = wholesale_order_items.order_id
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

-- Users can insert items into their own orders
CREATE POLICY "Users can insert own order items"
  ON wholesale_order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wholesale_orders
      WHERE id = wholesale_order_items.order_id
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

-- Service role can do anything
CREATE POLICY "Service role full access on order items"
  ON wholesale_order_items FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
