-- Create wholesale_cart table to store user cart items
CREATE TABLE IF NOT EXISTS wholesale_cart (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES wholesale_products(id) ON DELETE CASCADE,
  pack_size_id UUID REFERENCES wholesale_product_pack_sizes(id) ON DELETE SET NULL,

  -- Quantity of packs (not individual pieces)
  quantity INTEGER NOT NULL DEFAULT 1,

  -- Selected variations as JSON object
  -- Format: { "color:Red|size:M": 5, "color:Blue|size:L": 7 }
  -- Key is the combination string, value is the quantity for that combination
  selected_variations JSONB,

  -- Price at the time of adding to cart (for reference)
  unit_price DECIMAL(10, 2),
  pack_price DECIMAL(10, 2),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT positive_cart_quantity CHECK (quantity > 0),
  CONSTRAINT positive_unit_price CHECK (unit_price IS NULL OR unit_price >= 0),
  CONSTRAINT positive_pack_price CHECK (pack_price IS NULL OR pack_price >= 0),

  -- Each user can only have one entry per product + pack size combination
  CONSTRAINT unique_user_product_pack UNIQUE (user_id, product_id, pack_size_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wholesale_cart_user_id ON wholesale_cart(user_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_cart_product_id ON wholesale_cart(product_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_cart_pack_size_id ON wholesale_cart(pack_size_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_cart_created_at ON wholesale_cart(created_at DESC);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_wholesale_cart_updated_at
  BEFORE UPDATE ON wholesale_cart
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE wholesale_cart IS 'Shopping cart for wholesale products';
COMMENT ON COLUMN wholesale_cart.quantity IS 'Number of packs (not individual pieces)';
COMMENT ON COLUMN wholesale_cart.selected_variations IS 'JSON object mapping variation combinations to quantities (e.g., {"color:Red|size:M": 5, "color:Blue|size:L": 7})';
COMMENT ON COLUMN wholesale_cart.unit_price IS 'Unit price at the time of adding to cart';
COMMENT ON COLUMN wholesale_cart.pack_price IS 'Pack price at the time of adding to cart';

-- Enable Row Level Security (RLS)
ALTER TABLE wholesale_cart ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own cart items
CREATE POLICY "Users can view own cart items"
  ON wholesale_cart FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert into their own cart
CREATE POLICY "Users can insert own cart items"
  ON wholesale_cart FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own cart items
CREATE POLICY "Users can update own cart items"
  ON wholesale_cart FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own cart items
CREATE POLICY "Users can delete own cart items"
  ON wholesale_cart FOR DELETE
  USING (auth.uid() = user_id);

-- Create a view to get cart items with product details
CREATE OR REPLACE VIEW wholesale_cart_with_details AS
SELECT
  c.*,
  p.name as product_name,
  p.slug as product_slug,
  p.wholesale_price,
  p.sale_percentage,
  p.status as product_status,
  p.stock_quantity as product_stock,
  ps.label as pack_label,
  ps.quantity as pack_quantity,
  ps.pack_price as current_pack_price,
  ps.unit_price as current_unit_price,
  ps.is_available as pack_available,
  wb.display_name as brand_name,
  wb.brand_name as brand_slug,
  (
    SELECT image_url
    FROM wholesale_product_images
    WHERE product_id = p.id
    ORDER BY display_order ASC
    LIMIT 1
  ) as product_image
FROM wholesale_cart c
INNER JOIN wholesale_products p ON c.product_id = p.id
LEFT JOIN wholesale_product_pack_sizes ps ON c.pack_size_id = ps.id
INNER JOIN wholesale_brands wb ON p.wholesale_brand_id = wb.id
WHERE p.deleted_at IS NULL;
