-- 019_add_catalog_import_source.sql
--
-- Enables ownership-based ("catalog") imports into social: a user who owns an
-- approved wholesale brand and/or retail store can cross-list their OWN products
-- into their social catalog. This is distinct from the existing purchase-based
-- 'retail_import' (importing delivered retail order items you bought).

-- Extend the source_type check constraint to allow the two new catalog sources.
ALTER TABLE social_products
  DROP CONSTRAINT IF EXISTS social_products_source_type_check;

ALTER TABLE social_products
  ADD CONSTRAINT social_products_source_type_check
  CHECK (source_type IN (
    'manual',
    'retail_import',
    'wholesale_catalog_import',
    'retail_catalog_import'
  ));

-- Provenance + dedup: which source product a social listing was imported from.
ALTER TABLE social_products
  ADD COLUMN IF NOT EXISTS source_wholesale_product_id UUID;

ALTER TABLE social_products
  ADD COLUMN IF NOT EXISTS source_retail_product_id UUID;

CREATE INDEX IF NOT EXISTS idx_social_products_source_wholesale
  ON social_products(seller_id, source_wholesale_product_id)
  WHERE source_wholesale_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_products_source_retail
  ON social_products(seller_id, source_retail_product_id)
  WHERE source_retail_product_id IS NOT NULL;

COMMENT ON COLUMN social_products.source_wholesale_product_id IS 'Wholesale product this listing was catalog-imported from (source_type = wholesale_catalog_import)';
COMMENT ON COLUMN social_products.source_retail_product_id IS 'Retail product this listing was catalog-imported from (source_type = retail_catalog_import)';
