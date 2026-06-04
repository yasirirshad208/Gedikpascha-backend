-- Add followers_count column to wholesale_brands table
ALTER TABLE wholesale_brands 
ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0;

-- Create index on followers_count for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_wholesale_brands_followers_count ON wholesale_brands(followers_count DESC);

-- Comment on column
COMMENT ON COLUMN wholesale_brands.followers_count IS 'Number of followers for this wholesale brand';

