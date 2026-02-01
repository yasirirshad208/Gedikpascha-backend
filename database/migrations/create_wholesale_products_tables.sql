-- Create wholesale_products table
CREATE TABLE IF NOT EXISTS wholesale_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesale_brand_id UUID NOT NULL REFERENCES wholesale_brands(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
  
  -- Basic product information
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  sku VARCHAR(100) UNIQUE,
  description TEXT,
  short_description VARCHAR(500),
  
  -- Pricing
  wholesale_price DECIMAL(10, 2) NOT NULL,
  sale_percentage INTEGER DEFAULT 0 CHECK (sale_percentage >= 0 AND sale_percentage <= 100), -- Sale discount percentage (e.g., 10 = 10%)
  
  -- MOQ (Minimum Order Quantity) settings
  min_order_quantity INTEGER NOT NULL DEFAULT 1,
  min_order_amount DECIMAL(10, 2), -- Alternative MOQ based on dollar amount
  
  -- Inventory
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  track_inventory BOOLEAN NOT NULL DEFAULT true,
  low_stock_threshold INTEGER DEFAULT 10,
  total_sold INTEGER NOT NULL DEFAULT 0, -- Total quantity sold
  
  -- Product status and visibility
  -- draft: Product is being created/edited by owner, NOT visible to public
  -- active: Product is live and visible to public
  -- inactive: Product is temporarily hidden from public
  -- archived: Product is archived and NOT visible to public
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  condition VARCHAR(20) DEFAULT 'new' CHECK (condition IN ('new', 'used', 'refurbished')),
  
  -- Ratings and reviews (aggregated)
  rating DECIMAL(3, 2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER NOT NULL DEFAULT 0, -- Total number of reviews
  
  -- Engagement metrics
  visited_count INTEGER NOT NULL DEFAULT 0, -- Number of times product detail page was visited
  favourites_count INTEGER NOT NULL DEFAULT 0, -- Number of users who favorited this product
  
  -- Shipping information
  shipping_info TEXT, -- Shipping details (e.g., "Delivered within 2-3 days")
  is_shipping_free BOOLEAN NOT NULL DEFAULT false, -- Whether shipping is free for this product
  shipping_cost DECIMAL(10, 2), -- Shipping cost (if not free)
  estimated_delivery_days INTEGER, -- Estimated delivery time in days
  
  -- Product details (flexible JSON object for custom key-value pairs)
  -- Users can add any product details like: {"Material": "100% Cotton", "Care": "Machine Wash", "Origin": "Turkey", etc.}
  product_details JSONB, -- Custom product details as key-value pairs (JSON object)
  
  -- Size chart (can be stored as JSON or text)
  size_chart JSONB, -- Size chart data (structured or can be null)
  
  -- SEO and metadata
  meta_title VARCHAR(255),
  meta_description TEXT,
  meta_keywords VARCHAR(500),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
  
  -- Constraints
  CONSTRAINT unique_slug_per_brand UNIQUE (wholesale_brand_id, slug),
  CONSTRAINT positive_wholesale_price CHECK (wholesale_price >= 0),
  CONSTRAINT positive_min_order_quantity CHECK (min_order_quantity > 0),
  CONSTRAINT positive_min_order_amount CHECK (min_order_amount IS NULL OR min_order_amount > 0),
  CONSTRAINT positive_stock_quantity CHECK (stock_quantity >= 0),
  CONSTRAINT positive_total_sold CHECK (total_sold >= 0),
  CONSTRAINT positive_visited_count CHECK (visited_count >= 0),
  CONSTRAINT positive_favourites_count CHECK (favourites_count >= 0),
  CONSTRAINT positive_review_count CHECK (review_count >= 0),
  CONSTRAINT positive_shipping_cost CHECK (shipping_cost IS NULL OR shipping_cost >= 0),
  CONSTRAINT positive_estimated_delivery_days CHECK (estimated_delivery_days IS NULL OR estimated_delivery_days > 0)
);

-- Create wholesale_product_images table for multiple images
CREATE TABLE IF NOT EXISTS wholesale_product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES wholesale_products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  alt_text VARCHAR(255),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create wholesale_product_variations table for custom variations (colors, sizes, etc.)
CREATE TABLE IF NOT EXISTS wholesale_product_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES wholesale_products(id) ON DELETE CASCADE,
  
  -- Variation type (e.g., 'color', 'size', 'material')
  variation_type VARCHAR(50) NOT NULL,
  
  -- Variation name/label (e.g., 'Red', 'Large', 'Cotton')
  name VARCHAR(100) NOT NULL,
  
  -- Variation value (e.g., hex color code, size code)
  value VARCHAR(255),
  
  -- Pricing override for this variation (optional)
  price_override DECIMAL(10, 2),
  
  -- Stock for this specific variation
  stock_quantity INTEGER,
  track_stock BOOLEAN NOT NULL DEFAULT false,
  
  -- Availability
  is_available BOOLEAN NOT NULL DEFAULT true,
  
  -- Display order
  display_order INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT positive_price_override CHECK (price_override IS NULL OR price_override >= 0),
  CONSTRAINT positive_variation_stock CHECK (stock_quantity IS NULL OR stock_quantity >= 0)
);

-- Create wholesale_product_pack_sizes table for bulk pricing
CREATE TABLE IF NOT EXISTS wholesale_product_pack_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES wholesale_products(id) ON DELETE CASCADE,
  
  -- Pack details
  label VARCHAR(100) NOT NULL, -- e.g., "12 pieces", "24 pieces"
  quantity INTEGER NOT NULL, -- Number of items in this pack
  pack_price DECIMAL(10, 2) NOT NULL, -- Total price for the pack
  unit_price DECIMAL(10, 2), -- Calculated price per unit
  
  -- Badges
  is_popular BOOLEAN NOT NULL DEFAULT false,
  is_best_value BOOLEAN NOT NULL DEFAULT false,
  
  -- Availability
  is_available BOOLEAN NOT NULL DEFAULT true,
  
  -- Display order
  display_order INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT positive_quantity CHECK (quantity > 0),
  CONSTRAINT positive_pack_price CHECK (pack_price >= 0),
  CONSTRAINT positive_unit_price CHECK (unit_price IS NULL OR unit_price >= 0)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wholesale_products_brand_id ON wholesale_products(wholesale_brand_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_category_id ON wholesale_products(category_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_subcategory_id ON wholesale_products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_status ON wholesale_products(status);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_slug ON wholesale_products(slug);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_sku ON wholesale_products(sku);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_featured ON wholesale_products(is_featured);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_created_at ON wholesale_products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_deleted_at ON wholesale_products(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wholesale_products_total_sold ON wholesale_products(total_sold DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_rating ON wholesale_products(rating DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_visited_count ON wholesale_products(visited_count DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_favourites_count ON wholesale_products(favourites_count DESC);

CREATE INDEX IF NOT EXISTS idx_wholesale_product_images_product_id ON wholesale_product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_product_images_display_order ON wholesale_product_images(product_id, display_order);
CREATE INDEX IF NOT EXISTS idx_wholesale_product_images_primary ON wholesale_product_images(product_id, is_primary) WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_wholesale_product_variations_product_id ON wholesale_product_variations(product_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_product_variations_type ON wholesale_product_variations(product_id, variation_type);
CREATE INDEX IF NOT EXISTS idx_wholesale_product_variations_available ON wholesale_product_variations(product_id, is_available) WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_wholesale_product_pack_sizes_product_id ON wholesale_product_pack_sizes(product_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_product_pack_sizes_available ON wholesale_product_pack_sizes(product_id, is_available) WHERE is_available = true;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_wholesale_products_updated_at
  BEFORE UPDATE ON wholesale_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wholesale_product_variations_updated_at
  BEFORE UPDATE ON wholesale_product_variations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wholesale_product_pack_sizes_updated_at
  BEFORE UPDATE ON wholesale_product_pack_sizes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create a function to ensure only one primary image per product
CREATE OR REPLACE FUNCTION ensure_single_primary_image()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE wholesale_product_images
    SET is_primary = false
    WHERE product_id = NEW.product_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_primary_image_trigger
  BEFORE INSERT OR UPDATE ON wholesale_product_images
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION ensure_single_primary_image();

-- Add comments for documentation
COMMENT ON TABLE wholesale_products IS 'Wholesale products listed by approved brands';
COMMENT ON TABLE wholesale_product_images IS 'Multiple images for each wholesale product';
COMMENT ON TABLE wholesale_product_variations IS 'Custom variations for wholesale products (colors, sizes, materials, etc.)';
COMMENT ON TABLE wholesale_product_pack_sizes IS 'Bulk pricing packs for wholesale products';

COMMENT ON COLUMN wholesale_products.min_order_quantity IS 'Minimum order quantity (MOQ) - quantity-based';
COMMENT ON COLUMN wholesale_products.min_order_amount IS 'Minimum order amount (MOQ) - dollar-based alternative';
COMMENT ON COLUMN wholesale_products.status IS 'Product status: draft (not visible to public, owner editing), active (visible to public), inactive (hidden from public), archived (not visible to public)';
COMMENT ON COLUMN wholesale_products.sale_percentage IS 'Sale discount percentage (0-100, e.g., 10 = 10% off)';
COMMENT ON COLUMN wholesale_products.total_sold IS 'Total quantity of products sold';
COMMENT ON COLUMN wholesale_products.visited_count IS 'Number of times product detail page was visited';
COMMENT ON COLUMN wholesale_products.favourites_count IS 'Number of users who favorited this product';
COMMENT ON COLUMN wholesale_products.review_count IS 'Total number of reviews for this product';
COMMENT ON COLUMN wholesale_products.shipping_info IS 'Shipping information and details';
COMMENT ON COLUMN wholesale_products.is_shipping_free IS 'Whether shipping is free for this product';
COMMENT ON COLUMN wholesale_products.product_details IS 'Custom product details as flexible JSON object with key-value pairs (e.g., {"Material": "100% Cotton", "Care": "Machine Wash", "Origin": "Turkey"})';
COMMENT ON COLUMN wholesale_product_variations.variation_type IS 'Type of variation: color, size, material, etc.';
COMMENT ON COLUMN wholesale_product_pack_sizes.unit_price IS 'Calculated price per unit for the pack';

-- Create a view for active products that meet visibility requirements
-- Products will only show to the public if ALL conditions are met:
-- 1. Product status is 'active' (draft, inactive, and archived products are NOT visible)
-- 2. Product is not deleted (soft delete)
-- 3. Brand status is 'approved'
-- 4. Category is active
-- Note: Products with status 'draft' are only visible to the product owner (for editing purposes)
CREATE OR REPLACE VIEW active_wholesale_products AS
SELECT 
  p.*,
  wb.status as brand_status,
  wb.display_name as brand_name,
  c.name as category_name,
  c.is_active as category_active,
  sc.name as subcategory_name,
  sc.is_active as subcategory_active
FROM wholesale_products p
INNER JOIN wholesale_brands wb ON p.wholesale_brand_id = wb.id
INNER JOIN categories c ON p.category_id = c.id
LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
WHERE 
  p.status = 'active' -- Only 'active' products are visible to public (excludes 'draft', 'inactive', 'archived')
  AND p.deleted_at IS NULL
  AND wb.status = 'approved'
  AND c.is_active = true
  AND (sc.id IS NULL OR sc.is_active = true);

-- Grant necessary permissions (adjust based on your RLS policies)
-- These will be managed through Supabase RLS policies

