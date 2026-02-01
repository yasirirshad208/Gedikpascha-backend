-- Create wholesale_favourites table for tracking user's favourite products
CREATE TABLE IF NOT EXISTS wholesale_favourites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES wholesale_products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Each user can only favourite a product once
  CONSTRAINT unique_user_product_favourite UNIQUE (user_id, product_id)
);

-- Create indexes for efficient queries
-- Index for fetching all favourites of a user (sorted by most recent)
CREATE INDEX IF NOT EXISTS idx_wholesale_favourites_user_id ON wholesale_favourites(user_id, created_at DESC);

-- Index for checking if a product is favourited by a user
CREATE INDEX IF NOT EXISTS idx_wholesale_favourites_product_id ON wholesale_favourites(product_id);

-- Composite index for efficient lookup of user's favourite status for multiple products
CREATE INDEX IF NOT EXISTS idx_wholesale_favourites_user_product ON wholesale_favourites(user_id, product_id);

-- Function to increment favourites_count on product when favourited
CREATE OR REPLACE FUNCTION increment_product_favourites_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE wholesale_products
  SET favourites_count = favourites_count + 1
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement favourites_count on product when unfavourited
CREATE OR REPLACE FUNCTION decrement_product_favourites_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE wholesale_products
  SET favourites_count = GREATEST(favourites_count - 1, 0)
  WHERE id = OLD.product_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to increment count when favourite is added
CREATE TRIGGER trigger_increment_favourites_count
  AFTER INSERT ON wholesale_favourites
  FOR EACH ROW
  EXECUTE FUNCTION increment_product_favourites_count();

-- Trigger to decrement count when favourite is removed
CREATE TRIGGER trigger_decrement_favourites_count
  AFTER DELETE ON wholesale_favourites
  FOR EACH ROW
  EXECUTE FUNCTION decrement_product_favourites_count();

-- Add comment for documentation
COMMENT ON TABLE wholesale_favourites IS 'Tracks user favourite products for wholesale marketplace';
COMMENT ON COLUMN wholesale_favourites.user_id IS 'The user who favourited the product';
COMMENT ON COLUMN wholesale_favourites.product_id IS 'The product that was favourited';

-- Enable Row Level Security
ALTER TABLE wholesale_favourites ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own favourites
CREATE POLICY "Users can view their own favourites"
  ON wholesale_favourites
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own favourites
CREATE POLICY "Users can insert their own favourites"
  ON wholesale_favourites
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only delete their own favourites
CREATE POLICY "Users can delete their own favourites"
  ON wholesale_favourites
  FOR DELETE
  USING (auth.uid() = user_id);
