-- Sample Categories and Subcategories
-- Run this after creating the categories and subcategories tables

-- Insert Categories
INSERT INTO categories (name, slug, description, is_active, display_order) VALUES
  ('Fashion', 'fashion', 'Clothing, accessories, and style items for all ages and occasions', true, 1),
  ('Electronics', 'electronics', 'Electronic devices, gadgets, and tech accessories', true, 2),
  ('Home & Furniture', 'home-furniture', 'Furniture, decor, and home improvement products', true, 3),
  ('Beauty & Cosmetics', 'beauty-cosmetics', 'Makeup, skincare, and personal care products', true, 4),
  ('Sports & Outdoor', 'sports-outdoor', 'Sports equipment, outdoor gear, and fitness products', true, 5),
  ('Food & Beverage', 'food-beverage', 'Food products, beverages, and culinary items', true, 6),
  ('Books & Media', 'books-media', 'Books, magazines, and digital media content', true, 7)
ON CONFLICT (slug) DO NOTHING;

-- Insert Subcategories for Fashion
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Women''s Clothing', 'womens-clothing', 'Clothing items designed for women', true, 1
FROM categories WHERE slug = 'fashion'
ON CONFLICT (category_id, slug) DO NOTHING;

INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Men''s Clothing', 'mens-clothing', 'Clothing items designed for men', true, 2
FROM categories WHERE slug = 'fashion'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Electronics
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Smartphones & Accessories', 'smartphones-accessories', 'Mobile phones and related accessories', true, 1
FROM categories WHERE slug = 'electronics'
ON CONFLICT (category_id, slug) DO NOTHING;

INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Computers & Laptops', 'computers-laptops', 'Desktop computers, laptops, and related equipment', true, 2
FROM categories WHERE slug = 'electronics'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Home & Furniture
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Living Room Furniture', 'living-room-furniture', 'Sofas, tables, and living room essentials', true, 1
FROM categories WHERE slug = 'home-furniture'
ON CONFLICT (category_id, slug) DO NOTHING;

INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Kitchen & Dining', 'kitchen-dining', 'Kitchen appliances, utensils, and dining furniture', true, 2
FROM categories WHERE slug = 'home-furniture'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Beauty & Cosmetics
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Makeup & Cosmetics', 'makeup-cosmetics', 'Foundation, lipstick, eyeshadow, and makeup products', true, 1
FROM categories WHERE slug = 'beauty-cosmetics'
ON CONFLICT (category_id, slug) DO NOTHING;

INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Skincare Products', 'skincare-products', 'Facial care, moisturizers, and skincare essentials', true, 2
FROM categories WHERE slug = 'beauty-cosmetics'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Sports & Outdoor
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Fitness Equipment', 'fitness-equipment', 'Gym equipment, weights, and fitness accessories', true, 1
FROM categories WHERE slug = 'sports-outdoor'
ON CONFLICT (category_id, slug) DO NOTHING;

INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Outdoor Gear', 'outdoor-gear', 'Camping equipment, hiking gear, and outdoor essentials', true, 2
FROM categories WHERE slug = 'sports-outdoor'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Food & Beverage
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Fresh Produce', 'fresh-produce', 'Fresh fruits, vegetables, and organic produce', true, 1
FROM categories WHERE slug = 'food-beverage'
ON CONFLICT (category_id, slug) DO NOTHING;

INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Beverages & Drinks', 'beverages-drinks', 'Soft drinks, juices, tea, coffee, and alcoholic beverages', true, 2
FROM categories WHERE slug = 'food-beverage'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Insert Subcategories for Books & Media
INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Fiction Books', 'fiction-books', 'Novels, short stories, and fictional literature', true, 1
FROM categories WHERE slug = 'books-media'
ON CONFLICT (category_id, slug) DO NOTHING;

INSERT INTO subcategories (category_id, name, slug, description, is_active, display_order)
SELECT id, 'Non-Fiction Books', 'non-fiction-books', 'Educational, self-help, and informational books', true, 2
FROM categories WHERE slug = 'books-media'
ON CONFLICT (category_id, slug) DO NOTHING;

