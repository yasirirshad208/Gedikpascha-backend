-- Add public read policy for retail_products
-- This allows unauthenticated users to view active products from approved brands
-- Required for the public product detail page at /retail/products/[slug]

-- Make sure RLS is enabled
ALTER TABLE retail_products ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Public can view active retail products from approved brands" ON retail_products;

-- Create public read policy for active products from approved brands
CREATE POLICY "Public can view active retail products from approved brands"
  ON retail_products FOR SELECT
  USING (
    status = 'active' AND 
    retail_brand_id IN (SELECT id FROM retail_brands WHERE status = 'approved')
  );

