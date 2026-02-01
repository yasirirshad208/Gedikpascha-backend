-- Add full categories and subcategories as per user requirements
-- This migration inserts the specified categories and their subcategories

-- Insert Main Categories
INSERT INTO categories (name, slug, description, is_active, display_order) VALUES
  ('Fashion (Clothing & Accessories)', 'fashion-clothing-accessories', 'Clothing, accessories, and style items', true, 1),
  ('Footwear', 'footwear', 'Shoes and footwear for all', true, 2),
  ('Electronics', 'electronics', 'Electronic devices and accessories', true, 3),
  ('Home, Living & Decoration', 'home-living-decoration', 'Home decor and living essentials', true, 4),
  ('Cosmetics & Personal Care', 'cosmetics-personal-care', 'Beauty and personal care products', true, 5),
  ('Mother, Baby & Toy', 'mother-baby-toy', 'Products for mothers, babies, and toys', true, 6),
  ('Sports & Outdoor', 'sports-outdoor', 'Sports and outdoor equipment', true, 7),
  ('Supermarket & Food', 'supermarket-food', 'Food and supermarket items', true, 8),
  ('Books, Music, Movies & Hobby', 'books-music-movies-hobby', 'Books, media, and hobby items', true, 9),
  ('Auto, Hardware & Garden', 'auto-hardware-garden', 'Auto, hardware, and garden products', true, 10),
  ('Pet Shop', 'pet-shop', 'Pet care and accessories', true, 11),
  ('Office & Stationery', 'office-stationery', 'Office supplies and stationery', true, 12)
ON CONFLICT (slug) DO NOTHING;

-- Insert Subcategories for Fashion
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Women''s', 'womens', 'Women''s fashion items', true, 1 FROM categories WHERE slug = 'fashion-clothing-accessories'
UNION ALL
SELECT id, 'Men''s', 'mens', 'Men''s fashion items', true, 2 FROM categories WHERE slug = 'fashion-clothing-accessories'
UNION ALL
SELECT id, 'Kids & Baby', 'kids-baby', 'Kids and baby fashion', true, 3 FROM categories WHERE slug = 'fashion-clothing-accessories'
UNION ALL
SELECT id, 'Underwear', 'underwear', 'Underwear and lingerie', true, 4 FROM categories WHERE slug = 'fashion-clothing-accessories'
UNION ALL
SELECT id, 'Bags', 'bags', 'Bags and purses', true, 5 FROM categories WHERE slug = 'fashion-clothing-accessories'
UNION ALL
SELECT id, 'Jewelry', 'jewelry', 'Jewelry and accessories', true, 6 FROM categories WHERE slug = 'fashion-clothing-accessories'
UNION ALL
SELECT id, 'Watches', 'watches', 'Watches', true, 7 FROM categories WHERE slug = 'fashion-clothing-accessories'
UNION ALL
SELECT id, 'Eyewear', 'eyewear', 'Eyewear and glasses', true, 8 FROM categories WHERE slug = 'fashion-clothing-accessories'
UNION ALL
SELECT id, 'Accessories (Hat/Belt/Scarf)', 'accessories-hat-belt-scarf', 'Hats, belts, scarves', true, 9 FROM categories WHERE slug = 'fashion-clothing-accessories'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Footwear
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Women''s Footwear', 'womens-footwear', 'Women''s shoes', true, 1 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Men''s Footwear', 'mens-footwear', 'Men''s shoes', true, 2 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Children''s Footwear', 'childrens-footwear', 'Children''s shoes', true, 3 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Sport Shoes / Sneakers', 'sport-shoes-sneakers', 'Sport shoes and sneakers', true, 4 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Casual', 'casual', 'Casual footwear', true, 5 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Classic', 'classic', 'Classic shoes', true, 6 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Boots', 'boots', 'Boots', true, 7 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Ankle Boots', 'ankle-boots', 'Ankle boots', true, 8 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Sandals', 'sandals', 'Sandals', true, 9 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Slippers', 'slippers', 'Slippers', true, 10 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Outdoor / Trekking', 'outdoor-trekking', 'Outdoor and trekking shoes', true, 11 FROM categories WHERE slug = 'footwear'
UNION ALL
SELECT id, 'Occupational & Safety Shoes', 'occupational-safety-shoes', 'Safety and work shoes', true, 12 FROM categories WHERE slug = 'footwear'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Electronics
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Mobile & Accessories', 'mobile-accessories', 'Mobile phones and accessories', true, 1 FROM categories WHERE slug = 'electronics'
UNION ALL
SELECT id, 'Computer & Tablet', 'computer-tablet', 'Computers and tablets', true, 2 FROM categories WHERE slug = 'electronics'
UNION ALL
SELECT id, 'TV/Audio/Video', 'tv-audio-video', 'TV and audio/video equipment', true, 3 FROM categories WHERE slug = 'electronics'
UNION ALL
SELECT id, 'White Goods', 'white-goods', 'White goods appliances', true, 4 FROM categories WHERE slug = 'electronics'
UNION ALL
SELECT id, 'Small Appliances', 'small-appliances', 'Small household appliances', true, 5 FROM categories WHERE slug = 'electronics'
UNION ALL
SELECT id, 'Gaming', 'gaming', 'Gaming consoles and accessories', true, 6 FROM categories WHERE slug = 'electronics'
UNION ALL
SELECT id, 'Cameras', 'cameras', 'Cameras and photography', true, 7 FROM categories WHERE slug = 'electronics'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Home, Living & Decoration
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Furniture', 'furniture', 'Home furniture', true, 1 FROM categories WHERE slug = 'home-living-decoration'
UNION ALL
SELECT id, 'Textiles', 'textiles', 'Textiles and fabrics', true, 2 FROM categories WHERE slug = 'home-living-decoration'
UNION ALL
SELECT id, 'Decor', 'decor', 'Home decor items', true, 3 FROM categories WHERE slug = 'home-living-decoration'
UNION ALL
SELECT id, 'Kitchenware', 'kitchenware', 'Kitchen utensils and ware', true, 4 FROM categories WHERE slug = 'home-living-decoration'
UNION ALL
SELECT id, 'Lighting', 'lighting', 'Lighting fixtures', true, 5 FROM categories WHERE slug = 'home-living-decoration'
UNION ALL
SELECT id, 'Bathroom', 'bathroom', 'Bathroom accessories', true, 6 FROM categories WHERE slug = 'home-living-decoration'
UNION ALL
SELECT id, 'Rugs & Curtains', 'rugs-curtains', 'Rugs and curtains', true, 7 FROM categories WHERE slug = 'home-living-decoration'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Cosmetics & Personal Care
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Skin Care', 'skin-care', 'Skin care products', true, 1 FROM categories WHERE slug = 'cosmetics-personal-care'
UNION ALL
SELECT id, 'Makeup', 'makeup', 'Makeup products', true, 2 FROM categories WHERE slug = 'cosmetics-personal-care'
UNION ALL
SELECT id, 'Perfume', 'perfume', 'Perfumes and fragrances', true, 3 FROM categories WHERE slug = 'cosmetics-personal-care'
UNION ALL
SELECT id, 'Hair Care', 'hair-care', 'Hair care products', true, 4 FROM categories WHERE slug = 'cosmetics-personal-care'
UNION ALL
SELECT id, 'Grooming', 'grooming', 'Grooming products', true, 5 FROM categories WHERE slug = 'cosmetics-personal-care'
UNION ALL
SELECT id, 'Hygiene', 'hygiene', 'Hygiene products', true, 6 FROM categories WHERE slug = 'cosmetics-personal-care'
UNION ALL
SELECT id, 'Dermocosmetics', 'dermocosmetics', 'Dermocosmetic products', true, 7 FROM categories WHERE slug = 'cosmetics-personal-care'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Mother, Baby & Toy
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Clothing', 'clothing', 'Baby clothing', true, 1 FROM categories WHERE slug = 'mother-baby-toy'
UNION ALL
SELECT id, 'Diapers & Food', 'diapers-food', 'Diapers and baby food', true, 2 FROM categories WHERE slug = 'mother-baby-toy'
UNION ALL
SELECT id, 'Nursing', 'nursing', 'Nursing products', true, 3 FROM categories WHERE slug = 'mother-baby-toy'
UNION ALL
SELECT id, 'Toys', 'toys', 'Toys and games', true, 4 FROM categories WHERE slug = 'mother-baby-toy'
UNION ALL
SELECT id, 'Educational', 'educational', 'Educational toys', true, 5 FROM categories WHERE slug = 'mother-baby-toy'
UNION ALL
SELECT id, 'Nursery', 'nursery', 'Nursery items', true, 6 FROM categories WHERE slug = 'mother-baby-toy'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Sports & Outdoor
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Apparel', 'apparel', 'Sports apparel', true, 1 FROM categories WHERE slug = 'sports-outdoor'
UNION ALL
SELECT id, 'Equipment', 'equipment', 'Sports equipment', true, 2 FROM categories WHERE slug = 'sports-outdoor'
UNION ALL
SELECT id, 'Fitness', 'fitness', 'Fitness products', true, 3 FROM categories WHERE slug = 'sports-outdoor'
UNION ALL
SELECT id, 'Camping', 'camping', 'Camping gear', true, 4 FROM categories WHERE slug = 'sports-outdoor'
UNION ALL
SELECT id, 'Cycling', 'cycling', 'Cycling equipment', true, 5 FROM categories WHERE slug = 'sports-outdoor'
UNION ALL
SELECT id, 'Hunting & Fishing', 'hunting-fishing', 'Hunting and fishing gear', true, 6 FROM categories WHERE slug = 'sports-outdoor'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Supermarket & Food
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Basic Food', 'basic-food', 'Basic food items', true, 1 FROM categories WHERE slug = 'supermarket-food'
UNION ALL
SELECT id, 'Beverages', 'beverages', 'Beverages', true, 2 FROM categories WHERE slug = 'supermarket-food'
UNION ALL
SELECT id, 'Snacks', 'snacks', 'Snacks', true, 3 FROM categories WHERE slug = 'supermarket-food'
UNION ALL
SELECT id, 'Breakfast', 'breakfast', 'Breakfast items', true, 4 FROM categories WHERE slug = 'supermarket-food'
UNION ALL
SELECT id, 'Organic', 'organic', 'Organic products', true, 5 FROM categories WHERE slug = 'supermarket-food'
UNION ALL
SELECT id, 'Cleaning Supplies', 'cleaning-supplies', 'Cleaning supplies', true, 6 FROM categories WHERE slug = 'supermarket-food'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Books, Music, Movies & Hobby
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Books', 'books', 'Books', true, 1 FROM categories WHERE slug = 'books-music-movies-hobby'
UNION ALL
SELECT id, 'Stationery', 'stationery', 'Stationery', true, 2 FROM categories WHERE slug = 'books-music-movies-hobby'
UNION ALL
SELECT id, 'Crafts', 'crafts', 'Craft supplies', true, 3 FROM categories WHERE slug = 'books-music-movies-hobby'
UNION ALL
SELECT id, 'Puzzles', 'puzzles', 'Puzzles', true, 4 FROM categories WHERE slug = 'books-music-movies-hobby'
UNION ALL
SELECT id, 'Instruments', 'instruments', 'Musical instruments', true, 5 FROM categories WHERE slug = 'books-music-movies-hobby'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Auto, Hardware & Garden
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Auto Accessories', 'auto-accessories', 'Auto accessories', true, 1 FROM categories WHERE slug = 'auto-hardware-garden'
UNION ALL
SELECT id, 'Spare Parts', 'spare-parts', 'Auto spare parts', true, 2 FROM categories WHERE slug = 'auto-hardware-garden'
UNION ALL
SELECT id, 'Power Tools', 'power-tools', 'Power tools', true, 3 FROM categories WHERE slug = 'auto-hardware-garden'
UNION ALL
SELECT id, 'Hardware', 'hardware', 'Hardware items', true, 4 FROM categories WHERE slug = 'auto-hardware-garden'
UNION ALL
SELECT id, 'Garden', 'garden', 'Garden supplies', true, 5 FROM categories WHERE slug = 'auto-hardware-garden'
UNION ALL
SELECT id, 'Construction Materials', 'construction-materials', 'Construction materials', true, 6 FROM categories WHERE slug = 'auto-hardware-garden'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Pet Shop
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Cat', 'cat', 'Cat products', true, 1 FROM categories WHERE slug = 'pet-shop'
UNION ALL
SELECT id, 'Dog', 'dog', 'Dog products', true, 2 FROM categories WHERE slug = 'pet-shop'
UNION ALL
SELECT id, 'Fish', 'fish', 'Fish products', true, 3 FROM categories WHERE slug = 'pet-shop'
UNION ALL
SELECT id, 'Bird', 'bird', 'Bird products', true, 4 FROM categories WHERE slug = 'pet-shop'
UNION ALL
SELECT id, 'Food & Accessories', 'food-accessories', 'Pet food and accessories', true, 5 FROM categories WHERE slug = 'pet-shop'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Office & Stationery
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Office Furniture', 'office-furniture', 'Office furniture', true, 1 FROM categories WHERE slug = 'office-stationery'
UNION ALL
SELECT id, 'Printers & Supplies', 'printers-supplies', 'Printers and supplies', true, 2 FROM categories WHERE slug = 'office-stationery'
UNION ALL
SELECT id, 'Stationery', 'stationery', 'Stationery items', true, 3 FROM categories WHERE slug = 'office-stationery'
UNION ALL
SELECT id, 'School Supplies', 'school-supplies', 'School supplies', true, 4 FROM categories WHERE slug = 'office-stationery'
ON CONFLICT (category_id, slug) DO NOTHING;