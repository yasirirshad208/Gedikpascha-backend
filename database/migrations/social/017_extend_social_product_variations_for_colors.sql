-- 017_extend_social_product_variations_for_colors.sql

ALTER TABLE social_product_variations
ADD COLUMN IF NOT EXISTS variation_type VARCHAR(20) NOT NULL DEFAULT 'text';

ALTER TABLE social_product_variations
ADD COLUMN IF NOT EXISTS variation_options JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE social_product_variations
DROP CONSTRAINT IF EXISTS social_product_variations_type_guard;

ALTER TABLE social_product_variations
ADD CONSTRAINT social_product_variations_type_guard
CHECK (variation_type IN ('text', 'color'));

UPDATE social_product_variations
SET variation_options = (
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('label', value, 'value', value)),
    '[]'::jsonb
  )
  FROM unnest(COALESCE(variation_values, ARRAY[]::text[])) AS value
)
WHERE variation_options = '[]'::jsonb;
