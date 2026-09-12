-- =============================================================================
-- Retire auto_create_retail_products_from_order.
--
-- WHY: the trigger derived everything from the PACK, and both of its inputs are
-- empty in production:
--   * wholesale_pack_stock_matrix has 0 rows, so the per-combination branch
--     never ran;
--   * wholesale_order_items.pack_size_id is NULL on every row, so the pack
--     variation copy never ran either.
-- Every delivered order therefore produced a listing whose stock sat in one
-- 'default' row, under a key the storefront never looks up — so each colour and
-- size read as "out of stock" on a product that had stock.
--
-- Replaced by OrdersService.provisionRetailProductsForOrder, which reads
-- wholesale_order_items.selected_variations. That records exactly which colours
-- and sizes were bought and how many of each, so the retail listing gets the
-- variations actually purchased and stock the product page can find.
--
-- Dropping the trigger is required, not optional: leaving it in place would
-- double-count stock on every delivery.
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_auto_create_retail_products ON wholesale_orders;
DROP FUNCTION IF EXISTS auto_create_retail_products_from_order();
