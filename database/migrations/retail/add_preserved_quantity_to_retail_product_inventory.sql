-- Add preserved_quantity field to retail_product_inventory table
-- Allows retailers to reserve stock for each variation combination

ALTER TABLE retail_product_inventory 
ADD COLUMN IF NOT EXISTS preserved_quantity INTEGER NOT NULL DEFAULT 0 
CHECK (preserved_quantity >= 0);

-- Add constraint to ensure preserved quantity doesn't exceed stock_quantity
ALTER TABLE retail_product_inventory
ADD CONSTRAINT chk_inventory_preserved_not_exceed_stock 
CHECK (preserved_quantity <= stock_quantity);

-- Add index for filtering inventory with preserved stock
CREATE INDEX IF NOT EXISTS idx_inventory_preserved_stock 
ON retail_product_inventory(product_id, preserved_quantity) 
WHERE preserved_quantity > 0;

COMMENT ON COLUMN retail_product_inventory.preserved_quantity IS 'Stock quantity reserved/preserved for this variation combination, not available for sale';
