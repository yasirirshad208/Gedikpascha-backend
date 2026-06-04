-- Seed sub-subcategories for all existing active subcategories
-- Safe to run multiple times (uses ON CONFLICT).
--
-- Prerequisite:
-- 1) create_categories_table.sql
-- 2) create_sub_subcategories_table.sql

DO $$
BEGIN
  IF to_regclass('public.sub_subcategories') IS NULL THEN
    RAISE EXCEPTION 'Table public.sub_subcategories does not exist. Run create_sub_subcategories_table.sql first.';
  END IF;
END
$$;

WITH active_subcategories AS (
  SELECT
    s.id AS subcategory_id,
    s.name AS subcategory_name
  FROM subcategories s
  WHERE s.is_active = true
),
generated_seed AS (
  SELECT
    a.subcategory_id,
    x.name,
    x.slug,
    x.description,
    x.display_order
  FROM active_subcategories a
  CROSS JOIN LATERAL (
    VALUES
      (
        'Popular',
        'popular',
        'Popular picks in ' || a.subcategory_name,
        1
      ),
      (
        'New Arrivals',
        'new-arrivals',
        'Latest products in ' || a.subcategory_name,
        2
      ),
      (
        'Best Sellers',
        'best-sellers',
        'Top-selling products in ' || a.subcategory_name,
        3
      )
  ) AS x(name, slug, description, display_order)
)
INSERT INTO sub_subcategories (
  subcategory_id,
  name,
  slug,
  description,
  is_active,
  display_order
)
SELECT
  g.subcategory_id,
  g.name,
  g.slug,
  g.description,
  true,
  g.display_order
FROM generated_seed g
ON CONFLICT (subcategory_id, slug)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();
