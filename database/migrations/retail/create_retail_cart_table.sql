-- Create retail_cart table to store user cart items
CREATE TABLE IF NOT EXISTS retail_cart (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES retail_products(id) ON DELETE CASCADE,

  -- Quantity of individual pieces
  quantity INTEGER NOT NULL DEFAULT 1,

  -- Selected variations as combination key
  -- Format: "color:Black|size:Small" matching retail_product_inventory.combination_key
  combination_key TEXT,

  -- Price at the time of adding to cart (for reference)
  unit_price DECIMAL(10, 2),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT positive_cart_quantity CHECK (quantity > 0),
  CONSTRAINT positive_unit_price CHECK (unit_price IS NULL OR unit_price >= 0),

  -- Each user can only have one entry per product + combination_key
  CONSTRAINT unique_user_product_combination UNIQUE (user_id, product_id, combination_key)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_retail_cart_user_id ON retail_cart(user_id);
CREATE INDEX IF NOT EXISTS idx_retail_cart_product_id ON retail_cart(product_id);
CREATE INDEX IF NOT EXISTS idx_retail_cart_created_at ON retail_cart(created_at DESC);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_retail_cart_updated_at
  BEFORE UPDATE ON retail_cart
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE retail_cart IS 'Shopping cart for retail products';
COMMENT ON COLUMN retail_cart.quantity IS 'Number of individual pieces';
COMMENT ON COLUMN retail_cart.combination_key IS 'Selected variation combination (e.g., "color:Black|size:Small")';
COMMENT ON COLUMN retail_cart.unit_price IS 'Unit price at the time of adding to cart';

-- Enable Row Level Security (RLS)
ALTER TABLE retail_cart ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own cart items
CREATE POLICY "Users can view own cart items"
  ON retail_cart FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert into their own cart
CREATE POLICY "Users can insert own cart items"
  ON retail_cart FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own cart items
CREATE POLICY "Users can update own cart items"
  ON retail_cart FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own cart items
CREATE POLICY "Users can delete own cart items"
  ON retail_cart FOR DELETE
  USING (auth.uid() = user_id);

-- Create a view to get cart items with product details
CREATE OR REPLACE VIEW retail_cart_with_details AS
SELECT
  c.*,
  p.name as product_name,
  p.slug as product_slug,
  p.retail_price,
  p.compare_at_price,
  p.status as product_status,
  p.stock_quantity as product_stock,
  rb.display_name as brand_name,
  rb.brand_name as brand_slug,
  (
    SELECT image_url
    FROM retail_product_images
    WHERE product_id = p.id
    ORDER BY display_order ASC
    LIMIT 1
  ) as product_image,
  (
    SELECT stock_quantity
    FROM retail_product_inventory
    WHERE product_id = p.id
      AND combination_key = COALESCE(c.combination_key, 'default')
    LIMIT 1
  ) as available_stock
FROM retail_cart c
INNER JOIN retail_products p ON c.product_id = p.id
INNER JOIN retail_brands rb ON p.retail_brand_id = rb.id
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW retail_cart_with_details IS 'Cart items with product, brand, and stock details for easy querying';
