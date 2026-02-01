-- Add sell_as_retailer column to wholesale_orders table
ALTER TABLE wholesale_orders 
ADD COLUMN IF NOT EXISTS sell_as_retailer BOOLEAN NOT NULL DEFAULT false;

-- Add index for filtering orders by sell_as_retailer
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_sell_as_retailer 
ON wholesale_orders(sell_as_retailer);

-- Add comment to explain the column
COMMENT ON COLUMN wholesale_orders.sell_as_retailer IS 'Indicates if the order was placed with intent to resell as a retailer';
