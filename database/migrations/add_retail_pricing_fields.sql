-- Add retail pricing and product identification fields to wholesale_products table

-- Add new columns
ALTER TABLE wholesale_products
ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS model_code VARCHAR(100);

-- Add constraints
ALTER TABLE wholesale_products
ADD CONSTRAINT positive_retail_price CHECK (retail_price IS NULL OR retail_price >= 0),
ADD CONSTRAINT valid_vat_rate CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100)),
ADD CONSTRAINT unique_barcode UNIQUE (barcode);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wholesale_products_barcode ON wholesale_products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wholesale_products_model_code ON wholesale_products(model_code) WHERE model_code IS NOT NULL;

-- Update existing products to have a default retail price (optional, can be removed if not needed)
-- UPDATE wholesale_products SET retail_price = wholesale_price * 1.5 WHERE retail_price IS NULL;

COMMENT ON COLUMN wholesale_products.retail_price IS 'Suggested retail price for end customers';
COMMENT ON COLUMN wholesale_products.barcode IS 'Product barcode (EAN, UPC, etc.) - must be unique';
COMMENT ON COLUMN wholesale_products.vat_rate IS 'Value Added Tax rate percentage (0-100)';
COMMENT ON COLUMN wholesale_products.model_code IS 'Manufacturer model or style code';
