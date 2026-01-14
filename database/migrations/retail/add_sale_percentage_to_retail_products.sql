-- Add sale_percentage column to retail_products table
ALTER TABLE retail_products 
ADD COLUMN IF NOT EXISTS sale_percentage INTEGER DEFAULT 0 CHECK (sale_percentage >= 0 AND sale_percentage <= 100);

-- Add comment
COMMENT ON COLUMN retail_products.sale_percentage IS 'Sale discount percentage (0-100)';
