-- 020_default_currency_try.sql
--
-- The whole platform operates in Turkish Lira (Iyzico, wholesale, retail all use
-- TRY). The social marketplace was mistakenly defaulting to USD, which rendered
-- prices with a "$" symbol. Switch the column defaults to TRY and backfill the
-- existing USD rows (they were never really USD — the amounts are lira).

ALTER TABLE social_products ALTER COLUMN currency SET DEFAULT 'TRY';
UPDATE social_products SET currency = 'TRY' WHERE currency = 'USD' OR currency IS NULL;

-- Social sales/orders table (created in 010) also defaulted to USD.
ALTER TABLE social_sales_orders ALTER COLUMN currency SET DEFAULT 'TRY';
UPDATE social_sales_orders SET currency = 'TRY' WHERE currency = 'USD' OR currency IS NULL;
