-- Add is_exchangeable column to retail_products table
-- This allows sellers to mark which products are available for exchange with other retailers

ALTER TABLE retail_products
ADD COLUMN IF NOT EXISTS is_exchangeable BOOLEAN DEFAULT false;

-- Add index for efficient filtering of exchangeable products
CREATE INDEX IF NOT EXISTS idx_retail_products_is_exchangeable
ON retail_products (is_exchangeable)
WHERE is_exchangeable = true AND deleted_at IS NULL;

COMMENT ON COLUMN retail_products.is_exchangeable IS 'Whether this product is available for exchange with other retailers';
