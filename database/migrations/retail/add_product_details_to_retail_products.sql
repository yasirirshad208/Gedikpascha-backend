-- Add product_details JSONB column to retail_products table
-- This column stores category-specific attributes (Gender, Material, Style, etc.)
-- inherited from the source wholesale product for advanced filtering

ALTER TABLE retail_products
ADD COLUMN IF NOT EXISTS product_details JSONB DEFAULT NULL;

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_retail_products_product_details
ON retail_products USING GIN (product_details);

-- Add comment
COMMENT ON COLUMN retail_products.product_details IS 'Category-specific product attributes (Gender, Material, Style, etc.) copied from wholesale product for advanced filtering';

-- Backfill existing retail products with product_details from their source wholesale products
UPDATE retail_products rp
SET product_details = wp.product_details
FROM wholesale_products wp
WHERE rp.source_wholesale_product_id = wp.id
  AND rp.product_details IS NULL
  AND wp.product_details IS NOT NULL;
