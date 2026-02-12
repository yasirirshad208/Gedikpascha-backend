-- Update retail exchanges to support optional product offering
-- Initiator can offer all their products and set a minimum exchange value
-- Receiver picks products from initiator's catalog during approval

-- Add new columns to exchanges table
ALTER TABLE retail_product_exchanges
  ADD COLUMN IF NOT EXISTS offer_all_products BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_exchange_value DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initiator_total DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receiver_total DECIMAL(10, 2) DEFAULT 0;

-- Allow initiator_items to be empty at creation (receiver picks during approval)
-- No schema change needed - retail_exchange_items already supports this

COMMENT ON COLUMN retail_product_exchanges.offer_all_products IS 'If true, initiator offers all their products for receiver to choose from';
COMMENT ON COLUMN retail_product_exchanges.min_exchange_value IS 'Minimum value the receiver must pick from initiator products';
COMMENT ON COLUMN retail_product_exchanges.initiator_total IS 'Total value of initiator items (set after receiver picks)';
COMMENT ON COLUMN retail_product_exchanges.receiver_total IS 'Total value of receiver items (what initiator wants)';
