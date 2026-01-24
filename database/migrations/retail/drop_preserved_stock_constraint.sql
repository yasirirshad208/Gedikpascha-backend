-- Drop the constraint that prevents preserved_quantity from exceeding stock_quantity
-- Since stock_quantity represents available stock after subtracting preserved, preserved can exceed it

ALTER TABLE retail_product_inventory
DROP CONSTRAINT IF EXISTS chk_inventory_preserved_not_exceed_stock;