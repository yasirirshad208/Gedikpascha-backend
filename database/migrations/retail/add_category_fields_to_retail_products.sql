-- Add category and subcategory fields to retail_products table
-- Links retail products to global categories for filtering

ALTER TABLE retail_products
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE retail_products
ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_retail_products_category_id ON retail_products(category_id);
CREATE INDEX IF NOT EXISTS idx_retail_products_subcategory_id ON retail_products(subcategory_id);

-- Note: PostgreSQL doesn't support subqueries in CHECK constraints
-- Validation that subcategory belongs to category should be done at application level
-- The foreign key constraints ensure referential integrity

COMMENT ON COLUMN retail_products.category_id IS 'Reference to global categories table';
COMMENT ON COLUMN retail_products.subcategory_id IS 'Reference to global subcategories table';