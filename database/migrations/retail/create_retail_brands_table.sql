-- Create retail_brands table
CREATE TABLE IF NOT EXISTS retail_brands (
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
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_retail_brands_user_id ON retail_brands(user_id);

-- Create unique index on brand_name
CREATE UNIQUE INDEX IF NOT EXISTS idx_retail_brands_brand_name_unique ON retail_brands(brand_name);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_retail_brands_status ON retail_brands(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_retail_brands_created_at ON retail_brands(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE retail_brands ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own brand
CREATE POLICY "Users can view their own retail brand"
  ON retail_brands FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own brand
CREATE POLICY "Users can insert their own retail brand"
  ON retail_brands FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own brand (except status)
CREATE POLICY "Users can update their own retail brand"
  ON retail_brands FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Admins can view all brands
CREATE POLICY "Admins can view all retail brands"
  ON retail_brands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin' OR auth.users.raw_user_meta_data->>'isAdmin' = 'true')
    )
  );

-- Policy: Admins can update all brands (for approval/rejection)
CREATE POLICY "Admins can update all retail brands"
  ON retail_brands FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin' OR auth.users.raw_user_meta_data->>'isAdmin' = 'true')
    )
  );

-- Policy: Public can view approved brands
CREATE POLICY "Public can view approved retail brands"
  ON retail_brands FOR SELECT
  USING (status = 'approved');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_retail_brands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_retail_brands_updated_at
  BEFORE UPDATE ON retail_brands
  FOR EACH ROW
  EXECUTE FUNCTION update_retail_brands_updated_at();

-- Add comment to table
COMMENT ON TABLE retail_brands IS 'Stores retail brand information for sellers on the platform';
