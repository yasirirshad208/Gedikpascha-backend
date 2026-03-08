-- 016_create_social_product_variations.sql

CREATE TABLE IF NOT EXISTS social_product_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  variation_name VARCHAR(80) NOT NULL,
  variation_values TEXT[] NOT NULL DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT social_product_variations_name_not_empty CHECK (btrim(variation_name) <> ''),
  CONSTRAINT social_product_variations_values_not_empty CHECK (cardinality(variation_values) > 0)
);

CREATE INDEX IF NOT EXISTS idx_social_product_variations_product
  ON social_product_variations(product_id);

CREATE INDEX IF NOT EXISTS idx_social_product_variations_order
  ON social_product_variations(product_id, display_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_product_variations_unique_name
  ON social_product_variations(product_id, lower(variation_name));

DROP TRIGGER IF EXISTS trigger_social_product_variations_updated_at ON social_product_variations;
CREATE TRIGGER trigger_social_product_variations_updated_at
BEFORE UPDATE ON social_product_variations
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_product_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own social product variations" ON social_product_variations;
CREATE POLICY "Users can manage own social product variations"
  ON social_product_variations FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM social_products sp
      WHERE sp.id = social_product_variations.product_id
        AND sp.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM social_products sp
      WHERE sp.id = social_product_variations.product_id
        AND sp.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access social product variations" ON social_product_variations;
CREATE POLICY "Service role full access social product variations"
  ON social_product_variations FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
