-- 002_create_social_products.sql

CREATE TABLE IF NOT EXISTS social_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  brand VARCHAR(255),
  condition VARCHAR(30) NOT NULL DEFAULT 'good',
  size VARCHAR(100),
  color VARCHAR(100),

  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id UUID REFERENCES subcategories(id) ON DELETE RESTRICT,
  sub_subcategory_id UUID REFERENCES sub_subcategories(id) ON DELETE RESTRICT,

  listing_type VARCHAR(20) NOT NULL DEFAULT 'shop' CHECK (listing_type IN ('shop', 'closet')),
  source_type VARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'retail_import')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'sold', 'archived')),

  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  price DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  compare_at_price DECIMAL(12, 2) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),

  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  available_quantity INTEGER NOT NULL DEFAULT 1 CHECK (available_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),

  is_exchangeable BOOLEAN NOT NULL DEFAULT true,
  allow_offers BOOLEAN NOT NULL DEFAULT true,

  city VARCHAR(120),
  country VARCHAR(120),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  views_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,

  published_at TIMESTAMP WITH TIME ZONE,
  sold_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE (seller_id, slug),
  CONSTRAINT social_products_quantity_guard CHECK (available_quantity <= quantity)
);

CREATE TABLE IF NOT EXISTS social_product_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type VARCHAR(20) NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_product_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  sku VARCHAR(120),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT social_product_inventory_guard CHECK (available_quantity + reserved_quantity <= quantity)
);

CREATE TABLE IF NOT EXISTS social_product_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  key VARCHAR(80) NOT NULL,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, key)
);

CREATE TABLE IF NOT EXISTS social_product_location (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES social_products(id) ON DELETE CASCADE,
  city VARCHAR(120),
  state VARCHAR(120),
  postal_code VARCHAR(40),
  country VARCHAR(120),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_products_seller ON social_products(seller_id);
CREATE INDEX IF NOT EXISTS idx_social_products_status ON social_products(status);
CREATE INDEX IF NOT EXISTS idx_social_products_listing_type ON social_products(listing_type);
CREATE INDEX IF NOT EXISTS idx_social_products_category ON social_products(category_id);
CREATE INDEX IF NOT EXISTS idx_social_products_subcategory ON social_products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_social_products_sub_subcategory ON social_products(sub_subcategory_id);
CREATE INDEX IF NOT EXISTS idx_social_products_created_at ON social_products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_products_rank ON social_products(status, likes_count DESC, views_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_product_media_product ON social_product_media(product_id);
CREATE INDEX IF NOT EXISTS idx_social_product_inventory_product ON social_product_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_social_product_attributes_product ON social_product_attributes(product_id);

CREATE OR REPLACE FUNCTION social_validate_product_taxonomy()
RETURNS TRIGGER AS $$
DECLARE
  category_active BOOLEAN;
  subcategory_category_id UUID;
  subcategory_active BOOLEAN;
  sub_sub_subcategory_id UUID;
  sub_sub_active BOOLEAN;
BEGIN
  SELECT c.is_active INTO category_active
  FROM categories c
  WHERE c.id = NEW.category_id;

  IF category_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Invalid or inactive category_id: %', NEW.category_id;
  END IF;

  IF NEW.subcategory_id IS NOT NULL THEN
    SELECT s.category_id, s.is_active
      INTO subcategory_category_id, subcategory_active
    FROM subcategories s
    WHERE s.id = NEW.subcategory_id;

    IF subcategory_category_id IS NULL THEN
      RAISE EXCEPTION 'Invalid subcategory_id: %', NEW.subcategory_id;
    END IF;

    IF subcategory_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Inactive subcategory_id: %', NEW.subcategory_id;
    END IF;

    IF subcategory_category_id <> NEW.category_id THEN
      RAISE EXCEPTION 'subcategory_id % does not belong to category_id %', NEW.subcategory_id, NEW.category_id;
    END IF;
  END IF;

  IF NEW.sub_subcategory_id IS NOT NULL THEN
    IF NEW.subcategory_id IS NULL THEN
      RAISE EXCEPTION 'sub_subcategory_id requires subcategory_id';
    END IF;

    SELECT ss.subcategory_id, ss.is_active
      INTO sub_sub_subcategory_id, sub_sub_active
    FROM sub_subcategories ss
    WHERE ss.id = NEW.sub_subcategory_id;

    IF sub_sub_subcategory_id IS NULL THEN
      RAISE EXCEPTION 'Invalid sub_subcategory_id: %', NEW.sub_subcategory_id;
    END IF;

    IF sub_sub_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Inactive sub_subcategory_id: %', NEW.sub_subcategory_id;
    END IF;

    IF sub_sub_subcategory_id <> NEW.subcategory_id THEN
      RAISE EXCEPTION 'sub_subcategory_id % does not belong to subcategory_id %', NEW.sub_subcategory_id, NEW.subcategory_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_validate_product_taxonomy ON social_products;
CREATE TRIGGER trigger_social_validate_product_taxonomy
BEFORE INSERT OR UPDATE OF category_id, subcategory_id, sub_subcategory_id ON social_products
FOR EACH ROW
EXECUTE FUNCTION social_validate_product_taxonomy();

DROP TRIGGER IF EXISTS trigger_social_products_updated_at ON social_products;
CREATE TRIGGER trigger_social_products_updated_at
BEFORE UPDATE ON social_products
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_product_inventory_updated_at ON social_product_inventory;
CREATE TRIGGER trigger_social_product_inventory_updated_at
BEFORE UPDATE ON social_product_inventory
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_product_location_updated_at ON social_product_location;
CREATE TRIGGER trigger_social_product_location_updated_at
BEFORE UPDATE ON social_product_location
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

CREATE OR REPLACE FUNCTION social_single_primary_product_media()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE social_product_media
    SET is_primary = false
    WHERE product_id = NEW.product_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_single_primary_product_media ON social_product_media;
CREATE TRIGGER trigger_social_single_primary_product_media
BEFORE INSERT OR UPDATE ON social_product_media
FOR EACH ROW
WHEN (NEW.is_primary = true)
EXECUTE FUNCTION social_single_primary_product_media();

ALTER TABLE social_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_product_location ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active social products" ON social_products;
CREATE POLICY "Public can view active social products"
  ON social_products FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Users can view own social products" ON social_products;
CREATE POLICY "Users can view own social products"
  ON social_products FOR SELECT
  USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users can insert own social products" ON social_products;
CREATE POLICY "Users can insert own social products"
  ON social_products FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users can update own social products" ON social_products;
CREATE POLICY "Users can update own social products"
  ON social_products FOR UPDATE
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users can delete own social products" ON social_products;
CREATE POLICY "Users can delete own social products"
  ON social_products FOR DELETE
  USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Service role full access social products" ON social_products;
CREATE POLICY "Service role full access social products"
  ON social_products FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Public can view media for active social products" ON social_product_media;
CREATE POLICY "Public can view media for active social products"
  ON social_product_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_products sp
      WHERE sp.id = social_product_media.product_id
      AND sp.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own social product media" ON social_product_media;
CREATE POLICY "Users can manage own social product media"
  ON social_product_media FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_products sp
      WHERE sp.id = social_product_media.product_id
      AND sp.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_products sp
      WHERE sp.id = social_product_media.product_id
      AND sp.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access social product media" ON social_product_media;
CREATE POLICY "Service role full access social product media"
  ON social_product_media FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Users can manage own social product inventory" ON social_product_inventory;
CREATE POLICY "Users can manage own social product inventory"
  ON social_product_inventory FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_products sp
      WHERE sp.id = social_product_inventory.product_id
      AND sp.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_products sp
      WHERE sp.id = social_product_inventory.product_id
      AND sp.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access social product inventory" ON social_product_inventory;
CREATE POLICY "Service role full access social product inventory"
  ON social_product_inventory FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Users can manage own social product attributes" ON social_product_attributes;
CREATE POLICY "Users can manage own social product attributes"
  ON social_product_attributes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_products sp
      WHERE sp.id = social_product_attributes.product_id
      AND sp.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_products sp
      WHERE sp.id = social_product_attributes.product_id
      AND sp.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access social product attributes" ON social_product_attributes;
CREATE POLICY "Service role full access social product attributes"
  ON social_product_attributes FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Users can manage own social product location" ON social_product_location;
CREATE POLICY "Users can manage own social product location"
  ON social_product_location FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_products sp
      WHERE sp.id = social_product_location.product_id
      AND sp.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_products sp
      WHERE sp.id = social_product_location.product_id
      AND sp.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access social product location" ON social_product_location;
CREATE POLICY "Service role full access social product location"
  ON social_product_location FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
