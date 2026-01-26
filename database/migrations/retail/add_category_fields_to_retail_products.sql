-- Add category and subcategory fields to retail_products table
-- Links retail products to global categories for filtering

ALTER TABLE retail_products
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE retail_products
ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_retail_products_category_id ON retail_products(category_id);
CREATE INDEX IF NOT EXISTS idx_retail_products_subcategory_id ON retail_products(subcategory_id);

-- Add constraint to ensure subcategory belongs to category
ALTER TABLE retail_products
ADD CONSTRAINT chk_retail_products_subcategory_belongs_to_category
CHECK (
  subcategory_id IS NULL OR
  category_id IS NOT NULL AND
  subcategory_id IN (
    SELECT id FROM subcategories WHERE category_id = retail_products.category_id
  )
);

COMMENT ON COLUMN retail_products.category_id IS 'Reference to global categories table';
COMMENT ON COLUMN retail_products.subcategory_id IS 'Reference to global subcategories table';