-- Migration: Add fixed quantities for pack variations
-- This allows wholesalers to pre-set quantity distributions for their packs
-- When enabled, customers see the pre-configured quantities instead of starting from zero

-- =====================================================
-- 1. Create wholesale_pack_fixed_quantities table
-- Stores pre-configured quantity distributions for pack variations
-- =====================================================
CREATE TABLE IF NOT EXISTS wholesale_pack_fixed_quantities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_size_id UUID NOT NULL REFERENCES wholesale_product_pack_sizes(id) ON DELETE CASCADE,

  -- Combination key: matches wholesale_pack_stock_matrix.combination_key
  -- e.g., "color:Red|size:Large" or "Blue-M-Cotton"
  combination_key VARCHAR(500) NOT NULL,

  -- Fixed quantity for this variation combination
  -- When a pack has fixed quantities enabled, this is shown to customers
  fixed_quantity INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT positive_fixed_quantity CHECK (fixed_quantity >= 0),

  -- Each combination can only have one fixed quantity per pack
  CONSTRAINT unique_combination_fixed_qty_per_pack UNIQUE (pack_size_id, combination_key)
);

-- =====================================================
-- 2. Add has_fixed_quantities column to pack_sizes table
-- Indicates whether this pack uses pre-configured quantities
-- =====================================================
ALTER TABLE wholesale_product_pack_sizes
ADD COLUMN IF NOT EXISTS has_fixed_quantities BOOLEAN NOT NULL DEFAULT false;

-- =====================================================
-- 3. Create indexes for better query performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_wholesale_pack_fixed_quantities_pack_size_id
  ON wholesale_pack_fixed_quantities(pack_size_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_pack_fixed_quantities_combination
  ON wholesale_pack_fixed_quantities(pack_size_id, combination_key);

-- =====================================================
-- 4. Create triggers for automatic updated_at timestamp
-- =====================================================
CREATE TRIGGER update_wholesale_pack_fixed_quantities_updated_at
  BEFORE UPDATE ON wholesale_pack_fixed_quantities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. Add comments for documentation
-- =====================================================
COMMENT ON TABLE wholesale_pack_fixed_quantities IS 'Pre-configured quantity distributions for pack variations that wholesalers can set';
COMMENT ON COLUMN wholesale_pack_fixed_quantities.combination_key IS 'Variation combination key (e.g., "color:Red|size:Large") matching stock matrix keys';
COMMENT ON COLUMN wholesale_pack_fixed_quantities.fixed_quantity IS 'Pre-set quantity for this variation combination';
COMMENT ON COLUMN wholesale_product_pack_sizes.has_fixed_quantities IS 'Whether this pack has pre-configured quantities enabled';
