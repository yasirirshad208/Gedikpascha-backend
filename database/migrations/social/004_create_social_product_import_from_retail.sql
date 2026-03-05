CREATE TABLE IF NOT EXISTS social_retail_purchase_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  social_product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  retail_order_id UUID NOT NULL REFERENCES retail_orders(id) ON DELETE CASCADE,
  retail_order_item_id UUID NOT NULL REFERENCES retail_order_items(id) ON DELETE CASCADE,
  imported_quantity INTEGER NOT NULL,
  immutable_snapshot JSONB NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_retail_import_qty CHECK (imported_quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_social_retail_links_user ON social_retail_purchase_links(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_retail_links_item ON social_retail_purchase_links(retail_order_item_id);
CREATE INDEX IF NOT EXISTS idx_social_retail_links_order ON social_retail_purchase_links(retail_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_retail_links_social_product_unique ON social_retail_purchase_links(social_product_id);

CREATE OR REPLACE FUNCTION social_revoke_imports_for_refunds()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'refunded') AND OLD.status <> NEW.status THEN
    UPDATE social_retail_purchase_links
    SET is_revoked = true,
        revoked_at = NOW()
    WHERE retail_order_id = NEW.id
      AND is_revoked = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_revoke_imports ON retail_orders;
CREATE TRIGGER trg_social_revoke_imports
AFTER UPDATE OF status ON retail_orders
FOR EACH ROW
EXECUTE FUNCTION social_revoke_imports_for_refunds();

ALTER TABLE social_retail_purchase_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own retail import links" ON social_retail_purchase_links;
CREATE POLICY "Users read own retail import links"
  ON social_retail_purchase_links FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own retail import links" ON social_retail_purchase_links;
CREATE POLICY "Users insert own retail import links"
  ON social_retail_purchase_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);
