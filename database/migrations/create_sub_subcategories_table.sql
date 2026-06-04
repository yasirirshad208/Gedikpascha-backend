-- Create sub-subcategories table (third-level taxonomy under subcategories)
CREATE TABLE IF NOT EXISTS sub_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id UUID NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(subcategory_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sub_subcategories_subcategory_id
  ON sub_subcategories(subcategory_id);

CREATE INDEX IF NOT EXISTS idx_sub_subcategories_slug
  ON sub_subcategories(slug);

CREATE INDEX IF NOT EXISTS idx_sub_subcategories_is_active
  ON sub_subcategories(is_active);

CREATE INDEX IF NOT EXISTS idx_sub_subcategories_display_order
  ON sub_subcategories(display_order);

-- Enable Row Level Security
ALTER TABLE sub_subcategories ENABLE ROW LEVEL SECURITY;

-- Public read policy (active records only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sub_subcategories'
      AND policyname = 'Public can view active sub subcategories'
  ) THEN
    CREATE POLICY "Public can view active sub subcategories"
      ON sub_subcategories FOR SELECT
      USING (is_active = true);
  END IF;
END
$$;

-- Admin full access policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sub_subcategories'
      AND policyname = 'Admins can manage sub subcategories'
  ) THEN
    CREATE POLICY "Admins can manage sub subcategories"
      ON sub_subcategories FOR ALL
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END
$$;

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_sub_subcategories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_sub_subcategories_updated_at'
  ) THEN
    CREATE TRIGGER update_sub_subcategories_updated_at
      BEFORE UPDATE ON sub_subcategories
      FOR EACH ROW
      EXECUTE FUNCTION update_sub_subcategories_updated_at();
  END IF;
END
$$;
