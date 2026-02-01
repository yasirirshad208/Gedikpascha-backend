-- Create wholesale_product_reviews table
CREATE TABLE IF NOT EXISTS wholesale_product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES wholesale_products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Review content
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(255),
  comment TEXT,

  -- Additional ratings (optional)
  quality_rating INTEGER CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)),
  value_rating INTEGER CHECK (value_rating IS NULL OR (value_rating >= 1 AND value_rating <= 5)),

  -- Review status
  is_verified_purchase BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT true, -- Auto-approve reviews, can be moderated later

  -- Helpful votes
  helpful_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Each user can only review a product once
  CONSTRAINT unique_user_product_review UNIQUE (product_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wholesale_product_reviews_product_id ON wholesale_product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_product_reviews_user_id ON wholesale_product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_product_reviews_rating ON wholesale_product_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_wholesale_product_reviews_created_at ON wholesale_product_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_product_reviews_approved ON wholesale_product_reviews(product_id, is_approved) WHERE is_approved = true;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_wholesale_product_reviews_updated_at
  BEFORE UPDATE ON wholesale_product_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to update product rating and review count when reviews change
CREATE OR REPLACE FUNCTION update_product_review_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE wholesale_products
    SET
      rating = (
        SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
        FROM wholesale_product_reviews
        WHERE product_id = NEW.product_id AND is_approved = true
      ),
      review_count = (
        SELECT COUNT(*)
        FROM wholesale_product_reviews
        WHERE product_id = NEW.product_id AND is_approved = true
      ),
      updated_at = NOW()
    WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE wholesale_products
    SET
      rating = (
        SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
        FROM wholesale_product_reviews
        WHERE product_id = OLD.product_id AND is_approved = true
      ),
      review_count = (
        SELECT COUNT(*)
        FROM wholesale_product_reviews
        WHERE product_id = OLD.product_id AND is_approved = true
      ),
      updated_at = NOW()
    WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update product stats on review changes
CREATE TRIGGER update_product_stats_on_review
  AFTER INSERT OR UPDATE OR DELETE ON wholesale_product_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_product_review_stats();

-- Add comments for documentation
COMMENT ON TABLE wholesale_product_reviews IS 'Product reviews submitted by users for wholesale products';
COMMENT ON COLUMN wholesale_product_reviews.rating IS 'Overall rating from 1 to 5 stars';
COMMENT ON COLUMN wholesale_product_reviews.quality_rating IS 'Optional quality rating from 1 to 5';
COMMENT ON COLUMN wholesale_product_reviews.value_rating IS 'Optional value for money rating from 1 to 5';
COMMENT ON COLUMN wholesale_product_reviews.is_verified_purchase IS 'True if the user has purchased this product';
COMMENT ON COLUMN wholesale_product_reviews.is_approved IS 'Whether the review is approved and visible';
COMMENT ON COLUMN wholesale_product_reviews.helpful_count IS 'Number of users who found this review helpful';
