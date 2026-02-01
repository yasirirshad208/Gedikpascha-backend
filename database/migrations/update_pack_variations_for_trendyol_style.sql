-- Migration: Update pack variations for Trendyol-style UI
-- This adds new columns to support the flat Color × Size × Custom variant structure

-- Add new columns to wholesale_pack_variations table for Trendyol-style variants
ALTER TABLE wholesale_pack_variations
ADD COLUMN IF NOT EXISTS color VARCHAR(100),
ADD COLUMN IF NOT EXISTS color_value VARCHAR(50),
ADD COLUMN IF NOT EXISTS size VARCHAR(50),
ADD COLUMN IF NOT EXISTS custom_values JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS fixed_qty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS otv_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS stock_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS lot_info VARCHAR(255);

-- Add constraints for new columns (using DO block to check if constraint exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positive_variant_stock') THEN
        ALTER TABLE wholesale_pack_variations ADD CONSTRAINT positive_variant_stock CHECK (stock IS NULL OR stock >= 0);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positive_variant_fixed_qty') THEN
        ALTER TABLE wholesale_pack_variations ADD CONSTRAINT positive_variant_fixed_qty CHECK (fixed_qty IS NULL OR fixed_qty >= 0);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_variant_vat_rate') THEN
        ALTER TABLE wholesale_pack_variations ADD CONSTRAINT valid_variant_vat_rate CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_variant_otv_rate') THEN
        ALTER TABLE wholesale_pack_variations ADD CONSTRAINT valid_variant_otv_rate CHECK (otv_rate IS NULL OR (otv_rate >= 0 AND otv_rate <= 100));
    END IF;
END $$;

-- Create index for color-size lookups
CREATE INDEX IF NOT EXISTS idx_pack_variations_color_size 
ON wholesale_pack_variations(pack_size_id, color, size);

-- Create index for barcode lookups
CREATE INDEX IF NOT EXISTS idx_pack_variations_barcode 
ON wholesale_pack_variations(barcode) 
WHERE barcode IS NOT NULL;

-- Create index for stock code lookups
CREATE INDEX IF NOT EXISTS idx_pack_variations_stock_code 
ON wholesale_pack_variations(stock_code) 
WHERE stock_code IS NOT NULL;

-- Comment on new columns
COMMENT ON COLUMN wholesale_pack_variations.color IS 'Color name (e.g., Red, Navy Blue)';
COMMENT ON COLUMN wholesale_pack_variations.color_value IS 'Hex color code (e.g., #FF0000)';
COMMENT ON COLUMN wholesale_pack_variations.size IS 'Size value (e.g., 40, M, XL)';
COMMENT ON COLUMN wholesale_pack_variations.custom_values IS 'Custom variation values as JSON object (e.g., {"Material": "Cotton", "Style": "Casual"})';
COMMENT ON COLUMN wholesale_pack_variations.barcode IS 'Product barcode/EAN';
COMMENT ON COLUMN wholesale_pack_variations.stock IS 'Stock quantity for this variant';
COMMENT ON COLUMN wholesale_pack_variations.fixed_qty IS 'Fixed quantity for this variant in the pack (used when pack has hasFixedQuantities=true)';
COMMENT ON COLUMN wholesale_pack_variations.vat_rate IS 'VAT percentage (0-100)';
COMMENT ON COLUMN wholesale_pack_variations.otv_rate IS 'Special consumption tax percentage (0-100)';
COMMENT ON COLUMN wholesale_pack_variations.stock_code IS 'Internal stock code/SKU';
COMMENT ON COLUMN wholesale_pack_variations.lot_info IS 'Lot/batch information';

