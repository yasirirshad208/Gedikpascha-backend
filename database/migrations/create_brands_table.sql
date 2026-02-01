-- Create wholesale_brands table
CREATE TABLE IF NOT EXISTS wholesale_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  country VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  website VARCHAR(255),
  logo_url TEXT,
  cover_image_url TEXT,
  category VARCHAR(100),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_wholesale_brands_user_id ON wholesale_brands(user_id);

-- Create unique index on brand_name (already has UNIQUE constraint, but index helps with performance)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wholesale_brands_brand_name_unique ON wholesale_brands(brand_name);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_wholesale_brands_status ON wholesale_brands(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_wholesale_brands_created_at ON wholesale_brands(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE wholesale_brands ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own brand
CREATE POLICY "Users can view their own wholesale brand"
  ON wholesale_brands FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own brand
CREATE POLICY "Users can insert their own wholesale brand"
  ON wholesale_brands FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all brands
CREATE POLICY "Admins can view all wholesale brands"
  ON wholesale_brands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin' OR auth.users.raw_user_meta_data->>'isAdmin' = 'true')
    )
  );

-- Policy: Admins can update brand status
CREATE POLICY "Admins can update wholesale brand status"
  ON wholesale_brands FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin' OR auth.users.raw_user_meta_data->>'isAdmin' = 'true')
    )
  );

-- Policy: Public can view approved brands (for display on website)
CREATE POLICY "Public can view approved wholesale brands"
  ON wholesale_brands FOR SELECT
  USING (status = 'approved');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_wholesale_brands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_wholesale_brands_updated_at
  BEFORE UPDATE ON wholesale_brands
  FOR EACH ROW
  EXECUTE FUNCTION update_wholesale_brands_updated_at();

