-- Migration: Add pack-level variations and stock matrix support
-- This migration adds support for:
-- 1. Pack-level variations (variations specific to each pack size, not just product-level)
-- 2. Image linking for variations (link a variation to a specific product image)
-- 3. Stock matrix for tracking stock of variation combinations within a pack

-- =====================================================
-- 1. Create wholesale_pack_variations table
-- This stores variations at the pack level (e.g., Pack "12 pieces" can have variations like Color: Red, Blue)
-- =====================================================
CREATE TABLE IF NOT EXISTS wholesale_pack_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_size_id UUID NOT NULL REFERENCES wholesale_product_pack_sizes(id) ON DELETE CASCADE,

  -- Variation type (e.g., 'color', 'size', 'material', or custom types)
  variation_type VARCHAR(50) NOT NULL,

  -- Variation name/label (e.g., 'Red', 'Large', 'Cotton')
  name VARCHAR(100) NOT NULL,

  -- Variation value (e.g., hex color code '#FF0000', size code 'XL', etc.)
  value VARCHAR(255),

  -- Link to product image (index of the image in wholesale_product_images, 0-based)
  -- When customer selects this variation, the linked image should be displayed
  image_index INTEGER,

  -- Availability
  is_available BOOLEAN NOT NULL DEFAULT true,

  -- Display order for sorting
  display_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT positive_image_index CHECK (image_index IS NULL OR image_index >= 0)
);

-- =====================================================
-- 2. Create wholesale_pack_stock_matrix table
-- This stores stock quantities for specific combinations of variations within a pack
-- e.g., Pack "12 pieces" with Color: Red + Size: Large = 50 units in stock
-- =====================================================
CREATE TABLE IF NOT EXISTS wholesale_pack_stock_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_size_id UUID NOT NULL REFERENCES wholesale_product_pack_sizes(id) ON DELETE CASCADE,

  -- Combination key: concatenation of variation names (e.g., "Red-Large" or "Blue-Medium-Cotton")
  -- This key uniquely identifies a specific combination of variations
  combination_key VARCHAR(500) NOT NULL,

  -- Stock quantity for this specific combination
  stock_quantity INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT positive_matrix_stock CHECK (stock_quantity >= 0),

  -- Each combination key must be unique per pack
  CONSTRAINT unique_combination_per_pack UNIQUE (pack_size_id, combination_key)
);

-- =====================================================
-- 3. Create indexes for better query performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_wholesale_pack_variations_pack_size_id
  ON wholesale_pack_variations(pack_size_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_pack_variations_type
  ON wholesale_pack_variations(pack_size_id, variation_type);

CREATE INDEX IF NOT EXISTS idx_wholesale_pack_variations_available
  ON wholesale_pack_variations(pack_size_id, is_available)
  WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_wholesale_pack_variations_display_order
  ON wholesale_pack_variations(pack_size_id, display_order);

CREATE INDEX IF NOT EXISTS idx_wholesale_pack_stock_matrix_pack_size_id
  ON wholesale_pack_stock_matrix(pack_size_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_pack_stock_matrix_combination
  ON wholesale_pack_stock_matrix(pack_size_id, combination_key);

-- =====================================================
-- 4. Create triggers for automatic updated_at timestamp
-- =====================================================
CREATE TRIGGER update_wholesale_pack_variations_updated_at
  BEFORE UPDATE ON wholesale_pack_variations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wholesale_pack_stock_matrix_updated_at
  BEFORE UPDATE ON wholesale_pack_stock_matrix
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. Add comments for documentation
-- =====================================================
COMMENT ON TABLE wholesale_pack_variations IS 'Variations specific to each pack size (colors, sizes, materials, etc.)';
COMMENT ON TABLE wholesale_pack_stock_matrix IS 'Stock quantities for specific variation combinations within a pack';

COMMENT ON COLUMN wholesale_pack_variations.variation_type IS 'Type of variation: color, size, material, style, or custom types';
COMMENT ON COLUMN wholesale_pack_variations.name IS 'Display name of the variation (e.g., Red, Large, Cotton)';
COMMENT ON COLUMN wholesale_pack_variations.value IS 'Optional value for the variation (e.g., hex color code, size measurement)';
COMMENT ON COLUMN wholesale_pack_variations.image_index IS 'Index of linked product image (0-based). When this variation is selected, the corresponding image should be displayed.';
COMMENT ON COLUMN wholesale_pack_variations.display_order IS 'Order in which variations should be displayed';

COMMENT ON COLUMN wholesale_pack_stock_matrix.combination_key IS 'Unique key for variation combination (e.g., "Red-Large" or "Blue-M-Cotton"). Generated by concatenating variation names.';
COMMENT ON COLUMN wholesale_pack_stock_matrix.stock_quantity IS 'Available stock for this specific variation combination';

-- =====================================================
-- 6. Optional: Add helper function to calculate total pack stock from matrix
-- =====================================================
CREATE OR REPLACE FUNCTION get_pack_total_stock(p_pack_size_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total INTEGER;
BEGIN
  SELECT COALESCE(SUM(stock_quantity), 0)
  INTO total
  FROM wholesale_pack_stock_matrix
  WHERE pack_size_id = p_pack_size_id;

  RETURN total;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_pack_total_stock IS 'Returns the total stock quantity across all variation combinations for a given pack size';

-- =====================================================
-- 7. Optional: Add view to get pack variations with image URLs
-- =====================================================
CREATE OR REPLACE VIEW pack_variations_with_images AS
SELECT
  pv.*,
  ps.label as pack_label,
  ps.quantity as pack_quantity,
  ps.pack_price,
  ps.product_id,
  CASE
    WHEN pv.image_index IS NOT NULL THEN (
      SELECT pi.image_url
      FROM wholesale_product_images pi
      WHERE pi.product_id = ps.product_id
      ORDER BY pi.display_order
      LIMIT 1 OFFSET pv.image_index
    )
    ELSE NULL
  END as linked_image_url
FROM wholesale_pack_variations pv
INNER JOIN wholesale_product_pack_sizes ps ON pv.pack_size_id = ps.id;

COMMENT ON VIEW pack_variations_with_images IS 'Pack variations with their linked product image URLs resolved';
