-- ============================================================================
-- 017: Switch the payment gateway default from Iyzico to PayTR.
--
-- The Iyzico integration was removed. Existing tables carry a column default
-- of 'iyzico' that was baked in when those migrations first ran, so editing
-- the old files is not enough — the live defaults must be altered here.
--
-- Historical rows are left untouched on purpose: an order really was taken
-- through Iyzico, and rewriting that would falsify the payment audit trail.
-- Only the default for NEW rows changes.
-- ============================================================================

ALTER TABLE payment_transactions
  ALTER COLUMN provider SET DEFAULT 'paytr';

ALTER TABLE payment_events
  ALTER COLUMN provider SET DEFAULT 'paytr';

ALTER TABLE retail_orders
  ALTER COLUMN payment_provider SET DEFAULT 'paytr';

ALTER TABLE wholesale_orders
  ALTER COLUMN payment_provider SET DEFAULT 'paytr';

ALTER TABLE social_sales_orders
  ALTER COLUMN payment_provider SET DEFAULT 'paytr';

-- Sub-merchant rows describe an Iyzico marketplace registration that no longer
-- exists. They are kept (they hold the seller's IBAN/tax details, which are
-- still needed) but any provider key issued by Iyzico is now meaningless.
UPDATE sub_merchants
   SET sub_merchant_key = NULL,
       status = 'draft'
 WHERE sub_merchant_key IS NOT NULL;
