-- Adds subcategory/sub-subcategory scoping support to category_filter_config
-- so category-specific detail fields can be resolved by the selected taxonomy path.

ALTER TABLE category_filter_config
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES subcategories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sub_subcategory_id UUID REFERENCES sub_subcategories(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'category_filter_config_subscope_requires_subcategory'
  ) THEN
    ALTER TABLE category_filter_config
      ADD CONSTRAINT category_filter_config_subscope_requires_subcategory
      CHECK (sub_subcategory_id IS NULL OR subcategory_id IS NOT NULL);
  END IF;
END;
$$;

-- Replace old uniqueness (category_id, filter_key) with scoped uniqueness.
ALTER TABLE category_filter_config
  DROP CONSTRAINT IF EXISTS category_filter_config_category_id_filter_key_key;

DROP INDEX IF EXISTS uq_category_filter_config_scope_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_category_filter_config_scope_key
  ON category_filter_config (
    category_id,
    COALESCE(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(sub_subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid),
    filter_key
  );

CREATE INDEX IF NOT EXISTS idx_category_filter_config_scope_lookup
  ON category_filter_config (
    category_id,
    subcategory_id,
    sub_subcategory_id,
    is_active,
    display_order
  );
