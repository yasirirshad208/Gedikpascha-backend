-- Add total_followers and total_products columns to wholesale_brands table
ALTER TABLE wholesale_brands 
ADD COLUMN IF NOT EXISTS total_followers INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_products INTEGER NOT NULL DEFAULT 0;

-- Create index on total_followers for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_wholesale_brands_total_followers ON wholesale_brands(total_followers DESC);

-- Create index on total_products for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_wholesale_brands_total_products ON wholesale_brands(total_products DESC);

