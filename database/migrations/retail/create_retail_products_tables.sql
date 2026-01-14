-- Create retail_products table
CREATE TABLE IF NOT EXISTS retail_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retail_brand_id UUID NOT NULL REFERENCES retail_brands(id) ON DELETE CASCADE,
  
  -- Product information
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  sku VARCHAR(100) UNIQUE,
  description TEXT,
  short_description VARCHAR(500),
  
  -- Pricing
  cost_price DECIMAL(10, 2) NOT NULL, -- What retailer paid (read-only in UI)
  retail_price DECIMAL(10, 2), -- What they sell for (editable, nullable until set)
  compare_at_price DECIMAL(10, 2), -- Original price for showing discounts
  
  -- Inventory
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  track_inventory BOOLEAN NOT NULL DEFAULT true,
  low_stock_threshold INTEGER DEFAULT 5,
  
  -- Source tracking (links back to wholesale)
  source_wholesale_product_id UUID, -- Reference to wholesale_products(id)
  source_wholesale_slug VARCHAR(255), -- Wholesale product slug for restocking
  is_auto_imported BOOLEAN NOT NULL DEFAULT false,
  
  -- Product stats
  total_sold INTEGER NOT NULL DEFAULT 0,
  rating DECIMAL(3, 2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'out_of_stock')),
  
  -- SEO
  meta_title VARCHAR(255),
  meta_description TEXT,
  meta_keywords VARCHAR(500),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_retail_products_unique_slug_per_brand 
ON retail_products(retail_brand_id, slug) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_retail_products_brand_id ON retail_products(retail_brand_id);
CREATE INDEX IF NOT EXISTS idx_retail_products_status ON retail_products(status);
CREATE INDEX IF NOT EXISTS idx_retail_products_wholesale_source 
ON retail_products(source_wholesale_product_id) WHERE source_wholesale_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retail_products_low_stock 
ON retail_products(retail_brand_id, stock_quantity) 
WHERE status = 'active' AND track_inventory = true;

-- Create retail_product_images table
CREATE TABLE IF NOT EXISTS retail_product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES retail_products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  alt_text VARCHAR(255),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_product_images_product_id ON retail_product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_retail_product_images_display_order ON retail_product_images(product_id, display_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_retail_product_images_one_primary_per_product 
ON retail_product_images(product_id) WHERE is_primary = true;

-- Create retail_product_variations table
CREATE TABLE IF NOT EXISTS retail_product_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES retail_products(id) ON DELETE CASCADE,
  variation_type VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  value VARCHAR(255),
  is_available BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_product_variations_product_id ON retail_product_variations(product_id);

-- Create retail_product_inventory table
CREATE TABLE IF NOT EXISTS retail_product_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES retail_products(id) ON DELETE CASCADE,
  combination_key VARCHAR(500) NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  source_wholesale_order_item_id UUID,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retail_inventory_unique_combination_source 
ON retail_product_inventory(product_id, combination_key, source_wholesale_order_item_id);

CREATE INDEX IF NOT EXISTS idx_retail_product_inventory_product_id ON retail_product_inventory(product_id);

-- Update triggers
CREATE OR REPLACE FUNCTION update_retail_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_retail_products_updated_at
  BEFORE UPDATE ON retail_products
  FOR EACH ROW
  EXECUTE FUNCTION update_retail_products_updated_at();

CREATE TRIGGER trigger_update_retail_product_variations_updated_at
  BEFORE UPDATE ON retail_product_variations
  FOR EACH ROW
  EXECUTE FUNCTION update_retail_products_updated_at();

CREATE TRIGGER trigger_update_retail_product_inventory_updated_at
  BEFORE UPDATE ON retail_product_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_retail_products_updated_at();

-- Enable RLS
ALTER TABLE retail_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_product_inventory ENABLE ROW LEVEL SECURITY;

-- RLS Policies for retail_products
CREATE POLICY "Users can view their own retail products"
  ON retail_products FOR SELECT
  USING (retail_brand_id IN (SELECT id FROM retail_brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own retail products"
  ON retail_products FOR INSERT
  WITH CHECK (retail_brand_id IN (SELECT id FROM retail_brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own retail products"
  ON retail_products FOR UPDATE
  USING (retail_brand_id IN (SELECT id FROM retail_brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own retail products"
  ON retail_products FOR DELETE
  USING (retail_brand_id IN (SELECT id FROM retail_brands WHERE user_id = auth.uid()));

CREATE POLICY "Public can view active retail products"
  ON retail_products FOR SELECT
  USING (status = 'active' AND retail_brand_id IN (SELECT id FROM retail_brands WHERE status = 'approved'));

-- RLS for images, variations, and inventory
CREATE POLICY "Users can manage their own product images"
  ON retail_product_images FOR ALL
  USING (product_id IN (SELECT id FROM retail_products WHERE retail_brand_id IN (SELECT id FROM retail_brands WHERE user_id = auth.uid())));

CREATE POLICY "Public can view images of active products"
  ON retail_product_images FOR SELECT
  USING (product_id IN (SELECT id FROM retail_products WHERE status = 'active'));

CREATE POLICY "Users can manage their own product variations"
  ON retail_product_variations FOR ALL
  USING (product_id IN (SELECT id FROM retail_products WHERE retail_brand_id IN (SELECT id FROM retail_brands WHERE user_id = auth.uid())));

CREATE POLICY "Public can view variations of active products"
  ON retail_product_variations FOR SELECT
  USING (product_id IN (SELECT id FROM retail_products WHERE status = 'active'));

CREATE POLICY "Users can manage their own product inventory"
  ON retail_product_inventory FOR ALL
  USING (product_id IN (SELECT id FROM retail_products WHERE retail_brand_id IN (SELECT id FROM retail_brands WHERE user_id = auth.uid())));

CREATE POLICY "Public can view inventory of active products"
  ON retail_product_inventory FOR SELECT
  USING (product_id IN (SELECT id FROM retail_products WHERE status = 'active'));

-- Comments
COMMENT ON TABLE retail_products IS 'Stores retail products sold by retail brands';
COMMENT ON COLUMN retail_products.cost_price IS 'Wholesale price paid by retailer (read-only in UI)';
COMMENT ON COLUMN retail_products.retail_price IS 'Selling price set by retailer (editable)';
COMMENT ON COLUMN retail_products.source_wholesale_product_id IS 'Links to original wholesale product for restocking';
COMMENT ON COLUMN retail_products.source_wholesale_slug IS 'Wholesale product slug for easy navigation to restock';
COMMENT ON TABLE retail_product_images IS 'Stores images for retail products';
COMMENT ON TABLE retail_product_variations IS 'Stores product-level variations (color, size, etc.) for retail products';
COMMENT ON TABLE retail_product_inventory IS 'Tracks inventory by variation combination with source wholesale order tracking';
