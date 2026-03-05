CREATE TABLE IF NOT EXISTS social_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL,
  currency VARCHAR(12) NOT NULL DEFAULT 'TRY',
  category VARCHAR(120),
  brand VARCHAR(120),
  size VARCHAR(80),
  color VARCHAR(80),
  condition VARCHAR(30) NOT NULL DEFAULT 'new',
  listing_type VARCHAR(20) NOT NULL DEFAULT 'shop',
  source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  is_published BOOLEAN NOT NULL DEFAULT false,
  quantity INTEGER NOT NULL DEFAULT 1,
  available_quantity INTEGER NOT NULL DEFAULT 1,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  source_retail_order_id UUID,
  source_retail_order_item_id UUID,
  reference_price NUMERIC(12,2),
  context_ctr NUMERIC(8,4) NOT NULL DEFAULT 0,
  conversion_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  inventory_health NUMERIC(8,4) NOT NULL DEFAULT 1,
  engagement_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  seller_reputation NUMERIC(8,4) NOT NULL DEFAULT 0.5,
  snapshot_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_products_listing_type CHECK (listing_type IN ('shop', 'closet')),
  CONSTRAINT social_products_source_type CHECK (source_type IN ('manual', 'retail_import', 'reels', 'posts')),
  CONSTRAINT social_products_status CHECK (status IN ('draft', 'active', 'reserved', 'sold', 'archived')),
  CONSTRAINT social_products_condition CHECK (condition IN ('new', 'like_new', 'good', 'fair')),
  CONSTRAINT social_products_positive_price CHECK (price >= 0),
  CONSTRAINT social_products_positive_qty CHECK (quantity >= 0 AND available_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS social_product_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type VARCHAR(20) NOT NULL DEFAULT 'image',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_product_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  sku VARCHAR(120),
  variant_key VARCHAR(255) NOT NULL DEFAULT 'default',
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_product_inventory_unique UNIQUE (product_id, variant_key)
);

CREATE TABLE IF NOT EXISTS social_product_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  attr_key VARCHAR(120) NOT NULL,
  attr_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_product_location (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES social_products(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_content_product_tags_product_fk'
  ) THEN
    ALTER TABLE social_content_product_tags
      ADD CONSTRAINT social_content_product_tags_product_fk
      FOREIGN KEY (product_id) REFERENCES social_products(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_social_products_user ON social_products(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_products_status ON social_products(status, is_published);
CREATE INDEX IF NOT EXISTS idx_social_products_listing_type ON social_products(listing_type);
CREATE INDEX IF NOT EXISTS idx_social_products_category ON social_products(category);
CREATE INDEX IF NOT EXISTS idx_social_products_price ON social_products(price);
CREATE INDEX IF NOT EXISTS idx_social_products_location ON social_products(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_social_products_created ON social_products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_product_media_product ON social_product_media(product_id, display_order);
CREATE INDEX IF NOT EXISTS idx_social_product_inventory_product ON social_product_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_social_product_attributes_product ON social_product_attributes(product_id);
CREATE INDEX IF NOT EXISTS idx_social_product_location_coords ON social_product_location(latitude, longitude);

ALTER TABLE social_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_product_location ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published social products" ON social_products;
CREATE POLICY "Public read published social products"
  ON social_products FOR SELECT
  USING (is_published = true AND status IN ('active', 'reserved'));

DROP POLICY IF EXISTS "Users manage own social products" ON social_products;
CREATE POLICY "Users manage own social products"
  ON social_products FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read social product media" ON social_product_media;
CREATE POLICY "Public read social product media"
  ON social_product_media FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users manage own product media" ON social_product_media;
CREATE POLICY "Users manage own product media"
  ON social_product_media FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_products p
      WHERE p.id = social_product_media.product_id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users manage own product inventory" ON social_product_inventory;
CREATE POLICY "Users manage own product inventory"
  ON social_product_inventory FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_products p
      WHERE p.id = social_product_inventory.product_id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users manage own product attributes" ON social_product_attributes;
CREATE POLICY "Users manage own product attributes"
  ON social_product_attributes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_products p
      WHERE p.id = social_product_attributes.product_id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users manage own product location" ON social_product_location;
CREATE POLICY "Users manage own product location"
  ON social_product_location FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_products p
      WHERE p.id = social_product_location.product_id
      AND p.user_id = auth.uid()
    )
  );
