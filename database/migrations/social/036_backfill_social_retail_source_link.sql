-- ============================================================================
-- 036: Link imported social products back to the retail product they came from.
--
-- social_products.source_retail_product_id (added in 019) was never populated by
-- the retail import, so repeat imports of the same purchase could not be
-- recognised and each one created a duplicate listing. The import now sets it;
-- this backfills the rows created before that fix, using the import ledger.
-- ============================================================================

UPDATE social_products AS sp
   SET source_retail_product_id = ri.retail_product_id
  FROM social_retail_imports AS ri
 WHERE ri.social_product_id = sp.id
   AND sp.source_type = 'retail_import'
   AND sp.source_retail_product_id IS NULL
   AND ri.retail_product_id IS NOT NULL;
