-- =============================================================================
-- Backfill: give listings that have variations but only a 'default' stock row
-- one stock row per variation combination.
--
-- WHY: both paths that created these listings read wholesale_pack_stock_matrix,
-- which is empty in production, so all stock landed in a single 'default' row.
-- The storefront looks stock up by combination key, found nothing, and showed
-- "Selected variation out of stock" on products that had stock.
--
-- Only touches products in exactly that state, and only where every variation
-- shares one combined type (the `color_size` shape these products use), so the
-- key is `type:name` — the same key ProductDetails builds. The units are split
-- evenly with the remainder going to the earliest rows, so the total is
-- preserved exactly.
-- =============================================================================

WITH broken AS (
  SELECT p.id,
         p.stock_quantity,
         (SELECT count(DISTINCT v.variation_type)
            FROM retail_product_variations v WHERE v.product_id = p.id) AS type_count,
         (SELECT count(*)
            FROM retail_product_variations v WHERE v.product_id = p.id) AS variation_count
    FROM retail_products p
   WHERE p.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM retail_product_variations v WHERE v.product_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM retail_product_inventory i
                      WHERE i.product_id = p.id AND i.combination_key <> 'default')
),
eligible AS (
  SELECT * FROM broken WHERE type_count = 1 AND variation_count > 0
),
rows AS (
  SELECT e.id AS product_id,
         v.variation_type || ':' || v.name AS combination_key,
         (e.stock_quantity / e.variation_count)
           + CASE WHEN row_number() OVER (PARTITION BY e.id ORDER BY v.display_order, v.name)
                       <= (e.stock_quantity % e.variation_count)
                  THEN 1 ELSE 0 END AS qty
    FROM eligible e
    JOIN retail_product_variations v ON v.product_id = e.id
)
INSERT INTO retail_product_inventory (product_id, combination_key, stock_quantity, source_wholesale_order_item_id, added_at)
SELECT product_id, combination_key, qty, NULL, NOW() FROM rows;

-- The old catch-all row would double-count against the new per-variation rows.
DELETE FROM retail_product_inventory i
 USING retail_products p
 WHERE i.product_id = p.id
   AND i.combination_key = 'default'
   AND EXISTS (SELECT 1 FROM retail_product_inventory x
                WHERE x.product_id = p.id AND x.combination_key <> 'default');
