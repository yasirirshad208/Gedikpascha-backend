-- Migration: Create category filter configuration table
-- This table stores filter definitions per category for dynamic filtering

-- Create category_filter_config table
CREATE TABLE IF NOT EXISTS category_filter_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  filter_key VARCHAR(100) NOT NULL, -- e.g., 'color', 'material', 'shoeType'
  filter_label VARCHAR(100) NOT NULL, -- Display label for UI
  filter_type VARCHAR(50) NOT NULL, -- 'multi-select', 'single-select', 'range', 'checkbox', 'text'
  data_source VARCHAR(50) NOT NULL, -- 'variation', 'product_details', 'field', 'pack_variant'
  data_path VARCHAR(255), -- JSON path for product_details (e.g., 'Material', 'Features')
  options JSONB, -- Predefined options for select filters
  is_required BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category_id, filter_key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_category_filter_config_category_id ON category_filter_config(category_id);
CREATE INDEX IF NOT EXISTS idx_category_filter_config_active ON category_filter_config(is_active);

-- Create GIN index on wholesale_products.product_details for JSONB queries
CREATE INDEX IF NOT EXISTS idx_wholesale_products_product_details ON wholesale_products USING GIN (product_details);

-- Add comment to table
COMMENT ON TABLE category_filter_config IS 'Stores filter configuration per category for dynamic filtering on product listing pages';

-- Insert filter configurations for each category

-- =====================================================
-- 1. FASHION (17c0908d-8a86-4c04-873d-92648db61a2f)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('17c0908d-8a86-4c04-873d-92648db61a2f', 'gender', 'Gender', 'single-select', 'product_details', 'Gender', '["Women", "Men", "Unisex", "Kids", "Boys", "Girls"]', false, 1),
('17c0908d-8a86-4c04-873d-92648db61a2f', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["T-shirt", "Shirt", "Blouse", "Sweatshirt", "Sweater", "Jacket", "Coat", "Pants", "Skirt", "Shorts", "Dress", "Jumpsuit", "Cardigan", "Vest", "Hoodie"]', false, 2),
('17c0908d-8a86-4c04-873d-92648db61a2f', 'style', 'Style', 'multi-select', 'product_details', 'Style', '["Casual", "Formal", "Sportswear", "Streetwear", "Classic", "Outdoor", "Bohemian", "Vintage", "Modern", "Oversize", "Elegant", "Minimal"]', false, 3),
('17c0908d-8a86-4c04-873d-92648db61a2f', 'material', 'Material', 'multi-select', 'product_details', 'Material', '["Cotton", "Polyester", "Linen", "Wool", "Denim", "Viscose", "Blended Fabrics", "Velvet", "Satin", "Silk", "Suede", "Leather", "Synthetic"]', false, 4),
('17c0908d-8a86-4c04-873d-92648db61a2f', 'season', 'Season', 'multi-select', 'product_details', 'Season', '["Spring/Summer", "Fall/Winter", "All-Season"]', false, 5),
('17c0908d-8a86-4c04-873d-92648db61a2f', 'bagType', 'Bag Type', 'multi-select', 'product_details', 'BagType', '["Backpack", "Tote", "Shoulder Bag", "Crossbody", "Travel Bag", "Business/Laptop Bag", "Clutch", "Waist Bag", "Gym Bag", "Handbag", "Wallet"]', false, 6),
('17c0908d-8a86-4c04-873d-92648db61a2f', 'stone', 'Stone/Detail', 'multi-select', 'product_details', 'Stone', '["Zircon", "Crystal", "Pearl", "Natural Stone", "Diamond", "Gold Plated", "Silver Plated", "None"]', false, 7)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 2. ELECTRONICS (1e23eb0d-b16e-4055-85ab-7206b3d4cf1f)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Smartphone", "Laptop", "Tablet", "Smartwatch", "Wireless Earbuds", "LED TV", "DSLR Camera", "PlayStation", "Xbox", "Charger", "Case", "Screen Protector", "Power Bank", "Monitor", "Keyboard", "Mouse", "Headphones", "Speaker"]', false, 1),
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'operatingSystem', 'Operating System', 'multi-select', 'product_details', 'OperatingSystem', '["iOS", "Android", "Windows", "macOS", "Linux", "HarmonyOS", "iPadOS", "Chrome OS", "Wear OS"]', false, 2),
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'processor', 'Processor', 'multi-select', 'product_details', 'Processor', '["Intel Core i3", "Intel Core i5", "Intel Core i7", "Intel Core i9", "AMD Ryzen 3", "AMD Ryzen 5", "AMD Ryzen 7", "AMD Ryzen 9", "Apple M1", "Apple M2", "Apple M3", "Qualcomm Snapdragon", "MediaTek"]', false, 3),
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'ram', 'RAM', 'multi-select', 'product_details', 'RAM', '["2GB", "3GB", "4GB", "6GB", "8GB", "12GB", "16GB", "32GB", "64GB+"]', false, 4),
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'storage', 'Storage', 'multi-select', 'product_details', 'Storage', '["32GB", "64GB", "128GB", "256GB", "512GB", "1TB", "2TB+"]', false, 5),
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'storageType', 'Storage Type', 'multi-select', 'product_details', 'StorageType', '["HDD", "SSD", "Hybrid (HDD+SSD)", "eMMC", "NVMe SSD"]', false, 6),
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'displayType', 'Display Type', 'multi-select', 'product_details', 'DisplayType', '["LCD", "LED", "OLED", "AMOLED", "Super AMOLED", "IPS", "QLED", "Mini-LED", "Retina"]', false, 7),
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'screenSize', 'Screen Size', 'multi-select', 'product_details', 'ScreenSize', '["4.5\"-5.4\"", "5.5\"-6.1\"", "6.2\"-6.7\"", "6.8\"+", "10\"-11\"", "12\"-13\"", "14\"-15.6\"", "16\"-17\"+", "24\"-32\"", "40\"-49\"", "50\"-65\"", "70\"+"]', false, 8),
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'connectivity', 'Connectivity', 'multi-select', 'product_details', 'Connectivity', '["4G", "5G", "Wi-Fi 5", "Wi-Fi 6", "Wi-Fi 6E", "Bluetooth 5.0", "Bluetooth 5.1", "Bluetooth 5.2", "Bluetooth 5.3", "NFC", "USB-C", "Thunderbolt"]', false, 9),
('1e23eb0d-b16e-4055-85ab-7206b3d4cf1f', 'specialFeatures', 'Special Features', 'multi-select', 'product_details', 'SpecialFeatures', '["Fast Charging", "Wireless Charging", "Water Resistant (IP67/IP68)", "Face ID", "Fingerprint Sensor", "Dual SIM", "Stylus Support", "Foldable", "Touchscreen", "Backlit Keyboard", "ANC", "HDR", "Dolby Atmos"]', false, 10)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 3. HOME & FURNITURE (448dfbf3-8227-46e8-963d-c97e6d21bdd9)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('448dfbf3-8227-46e8-963d-c97e6d21bdd9', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Sofa", "Table", "Chair", "Bed", "Wardrobe", "Curtain", "Rug", "Wall Art", "Vase", "Cookware", "Dinnerware", "Cutlery", "Bedsheet", "Towel", "Pillow", "Lamp", "Chandelier", "Storage Box", "Shelf", "Garden Chair", "Plant Pot"]', false, 1),
('448dfbf3-8227-46e8-963d-c97e6d21bdd9', 'room', 'Room', 'multi-select', 'product_details', 'Room', '["Living Room", "Bedroom", "Dining Room", "Kitchen", "Bathroom", "Office", "Kids Room", "Balcony", "Garden"]', false, 2),
('448dfbf3-8227-46e8-963d-c97e6d21bdd9', 'style', 'Style', 'multi-select', 'product_details', 'Style', '["Modern", "Classic", "Minimalist", "Scandinavian", "Industrial", "Rustic", "Vintage", "Mid-Century", "Bohemian", "Contemporary"]', false, 3),
('448dfbf3-8227-46e8-963d-c97e6d21bdd9', 'material', 'Material', 'multi-select', 'product_details', 'Material', '["Solid Wood (Oak)", "Solid Wood (Walnut)", "Solid Wood (Pine)", "MDF", "Chipboard", "Metal", "Fabric", "Leather", "Velvet", "Rattan", "Glass", "Ceramic", "Porcelain", "Stainless Steel", "Plastic", "Cotton", "Linen"]', false, 4),
('448dfbf3-8227-46e8-963d-c97e6d21bdd9', 'features', 'Features', 'multi-select', 'product_details', 'Features', '["Storage Space", "Foldable", "Extendable", "Modular", "Assembled", "Ready-to-Assemble", "Washable", "Waterproof", "UV Resistant", "Dishwasher Safe", "Microwave Safe"]', false, 5),
('448dfbf3-8227-46e8-963d-c97e6d21bdd9', 'lightType', 'Light Type', 'multi-select', 'product_details', 'LightType', '["LED", "Halogen", "Incandescent", "Smart Bulb"]', false, 6),
('448dfbf3-8227-46e8-963d-c97e6d21bdd9', 'powerSource', 'Power Source', 'multi-select', 'product_details', 'PowerSource', '["Electric", "Battery", "Solar", "Candle"]', false, 7),
('448dfbf3-8227-46e8-963d-c97e6d21bdd9', 'assemblyRequired', 'Assembly Required', 'single-select', 'product_details', 'AssemblyRequired', '["Yes (DIY)", "No (Fully Assembled)", "Professional Installation Included"]', false, 8)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 4. BEAUTY & COSMETICS (efe28755-f42e-4b65-a609-398fb4275629)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('efe28755-f42e-4b65-a609-398fb4275629', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Moisturizer", "Cleanser", "Serum", "Mask", "Lipstick", "Foundation", "Mascara", "Shampoo", "Conditioner", "Hair Oil", "Perfume", "Cologne", "Body Lotion", "Shower Gel", "Nail Polish", "Nail Care Kit", "Razor", "Aftershave", "Toothpaste", "Deodorant"]', false, 1),
('efe28755-f42e-4b65-a609-398fb4275629', 'skinType', 'Skin Type', 'multi-select', 'product_details', 'SkinType', '["All Skin Types", "Dry", "Oily", "Combination", "Sensitive", "Acne-Prone", "Mature"]', false, 2),
('efe28755-f42e-4b65-a609-398fb4275629', 'hairType', 'Hair Type', 'multi-select', 'product_details', 'HairType', '["All Hair Types", "Dry", "Oily", "Normal", "Curly", "Straight", "Wavy", "Color-Treated", "Damaged"]', false, 3),
('efe28755-f42e-4b65-a609-398fb4275629', 'ingredients', 'Ingredients', 'multi-select', 'product_details', 'Ingredients', '["Natural", "Organic", "Vegan", "Cruelty-Free", "Chemical-Based", "Paraben-Free", "Sulfate-Free", "Alcohol-Free", "Fragrance-Free", "Hypoallergenic"]', false, 4),
('efe28755-f42e-4b65-a609-398fb4275629', 'concerns', 'Concerns/Benefits', 'multi-select', 'product_details', 'Concerns', '["Anti-Aging", "Hydrating", "Brightening", "Acne Treatment", "Sun Protection", "Anti-Wrinkle", "Firming", "Volume", "Hair Growth", "Anti-Dandruff", "Whitening"]', false, 5),
('efe28755-f42e-4b65-a609-398fb4275629', 'gender', 'Gender', 'single-select', 'product_details', 'Gender', '["Women", "Men", "Unisex"]', false, 6),
('efe28755-f42e-4b65-a609-398fb4275629', 'spf', 'SPF Level', 'multi-select', 'product_details', 'SPF', '["SPF 15", "SPF 30", "SPF 50", "SPF 50+"]', false, 7),
('efe28755-f42e-4b65-a609-398fb4275629', 'fragranceFamily', 'Fragrance Family', 'multi-select', 'product_details', 'FragranceFamily', '["Floral", "Woody", "Fresh", "Oriental", "Fruity", "Citrus", "Spicy"]', false, 8),
('efe28755-f42e-4b65-a609-398fb4275629', 'finishType', 'Finish Type', 'multi-select', 'product_details', 'FinishType', '["Matte", "Glossy", "Satin", "Dewy", "Natural"]', false, 9)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 5. SPORTS & OUTDOOR (1d04caf3-4422-4a1f-b332-55d51a6c5437)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('1d04caf3-4422-4a1f-b332-55d51a6c5437', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Treadmill", "Dumbbell", "Yoga Mat", "Resistance Band", "Tent", "Sleeping Bag", "Backpack", "Sports Shoes", "Tracksuit", "Football", "Basketball", "Swimsuit", "Goggles", "Ski Jacket", "Snowboard", "Bicycle", "Helmet", "Yoga Block"]', false, 1),
('1d04caf3-4422-4a1f-b332-55d51a6c5437', 'gender', 'Gender', 'single-select', 'product_details', 'Gender', '["Women", "Men", "Unisex", "Kids"]', false, 2),
('1d04caf3-4422-4a1f-b332-55d51a6c5437', 'material', 'Material', 'multi-select', 'product_details', 'Material', '["Polyester", "Nylon", "Cotton", "Spandex", "Aluminum", "Carbon Fiber", "Steel", "Rubber", "Mesh", "Gore-Tex", "EVA Foam"]', false, 3),
('1d04caf3-4422-4a1f-b332-55d51a6c5437', 'usage', 'Usage/Activity', 'multi-select', 'product_details', 'Usage', '["Fitness/Gym", "Running", "Cycling", "Swimming", "Football", "Basketball", "Hiking", "Camping", "Climbing", "Skiing", "Yoga", "Pilates", "Training"]', false, 4),
('1d04caf3-4422-4a1f-b332-55d51a6c5437', 'features', 'Features', 'multi-select', 'product_details', 'Features', '["Waterproof", "Breathable", "Lightweight", "Foldable", "Adjustable", "UV Protection", "Quick-Dry", "Anti-Slip", "Reflective", "Padded"]', false, 5),
('1d04caf3-4422-4a1f-b332-55d51a6c5437', 'season', 'Season', 'multi-select', 'product_details', 'Season', '["Summer", "Winter", "All-Season"]', false, 6),
('1d04caf3-4422-4a1f-b332-55d51a6c5437', 'skillLevel', 'Skill Level', 'multi-select', 'product_details', 'SkillLevel', '["Beginner", "Intermediate", "Advanced", "Professional"]', false, 7),
('1d04caf3-4422-4a1f-b332-55d51a6c5437', 'resistanceLevel', 'Resistance Level', 'multi-select', 'product_details', 'ResistanceLevel', '["Light", "Medium", "Heavy", "Extra Heavy"]', false, 8)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 6. FOOD & BEVERAGE (0da847c2-02a7-458a-b26a-b9e728705596)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('0da847c2-02a7-458a-b26a-b9e728705596', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Fruits", "Vegetables", "Milk", "Cheese", "Yogurt", "Eggs", "Chicken", "Beef", "Fish", "Bread", "Pastry", "Water", "Juice", "Coffee", "Tea", "Soda", "Chips", "Cookies", "Chocolate", "Pasta", "Rice", "Canned Beans", "Pizza", "Ice Cream", "Cereal", "Oats", "Ketchup", "Oil", "Spices"]', false, 1),
('0da847c2-02a7-458a-b26a-b9e728705596', 'packageType', 'Package Type', 'multi-select', 'product_details', 'PackageType', '["Single Unit", "Multi-Pack (2-pack)", "Multi-Pack (4-pack)", "Multi-Pack (6-pack)", "Family Size", "Bulk Pack", "Can", "Bottle", "Box", "Bag", "Jar", "Carton", "Tetra Pack"]', false, 2),
('0da847c2-02a7-458a-b26a-b9e728705596', 'organic', 'Organic/Natural', 'multi-select', 'product_details', 'Organic', '["Organic", "Natural", "Conventional", "GMO-Free", "Non-GMO"]', false, 3),
('0da847c2-02a7-458a-b26a-b9e728705596', 'dietary', 'Dietary', 'multi-select', 'product_details', 'Dietary', '["Gluten-Free", "Sugar-Free", "Lactose-Free", "Vegan", "Vegetarian", "Keto", "Paleo", "Halal", "Kosher", "Low Sodium", "Low Fat"]', false, 4),
('0da847c2-02a7-458a-b26a-b9e728705596', 'origin', 'Origin', 'multi-select', 'product_details', 'Origin', '["Local/Domestic", "Imported", "Aegean", "Mediterranean", "Black Sea", "Marmara", "Central Anatolia"]', false, 5),
('0da847c2-02a7-458a-b26a-b9e728705596', 'shelfLife', 'Shelf Life', 'multi-select', 'product_details', 'ShelfLife', '["1 Week", "2 Weeks", "1 Month", "2-3 Months", "3-6 Months", "6-12 Months", "12+ Months"]', false, 6),
('0da847c2-02a7-458a-b26a-b9e728705596', 'allergens', 'Allergens', 'multi-select', 'product_details', 'Allergens', '["Contains Nuts", "Contains Dairy", "Contains Gluten", "Contains Eggs", "Contains Soy", "Contains Fish", "Allergen-Free"]', false, 7),
('0da847c2-02a7-458a-b26a-b9e728705596', 'flavor', 'Flavor/Variant', 'multi-select', 'product_details', 'Flavor', '["Original", "Chocolate", "Vanilla", "Strawberry", "Lemon", "Orange", "Spicy", "BBQ", "Salt & Vinegar"]', false, 8),
('0da847c2-02a7-458a-b26a-b9e728705596', 'foodForm', 'Food Form', 'multi-select', 'product_details', 'FoodForm', '["Fresh", "Canned", "Frozen", "Dried", "Pickled", "Smoked"]', false, 9)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 7. BOOKS & MEDIA (bef41a67-abe5-43c7-b7f5-f48057365428)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('bef41a67-abe5-43c7-b7f5-f48057365428', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Novel", "Textbook", "Comic", "Biography", "CD", "Vinyl", "Digital Album", "Guitar", "Piano", "Drums", "Board Game", "Puzzle", "Card Game", "Action Figure", "Trading Cards", "Paint", "Model Kit", "Knitting Supplies"]', false, 1),
('bef41a67-abe5-43c7-b7f5-f48057365428', 'genre', 'Genre/Category', 'multi-select', 'product_details', 'Genre', '["Fiction", "Non-Fiction", "Sci-Fi", "Fantasy", "Mystery", "Romance", "Biography", "History", "Self-Help", "Children''s", "Pop", "Rock", "Classical", "Jazz", "Hip-Hop", "Electronic", "Strategy", "Educational", "Party", "Family"]', false, 2),
('bef41a67-abe5-43c7-b7f5-f48057365428', 'language', 'Language', 'multi-select', 'product_details', 'Language', '["Turkish", "English", "German", "French", "Spanish", "Arabic", "Russian", "Multi-Language", "Language Independent"]', false, 3),
('bef41a67-abe5-43c7-b7f5-f48057365428', 'format', 'Format', 'multi-select', 'product_details', 'Format', '["Paperback", "Hardcover", "E-Book", "Audiobook", "CD", "Vinyl (LP)", "Cassette", "Digital Download", "Physical", "Digital"]', false, 4),
('bef41a67-abe5-43c7-b7f5-f48057365428', 'ageGroup', 'Age Group', 'multi-select', 'product_details', 'AgeGroup', '["0-3 years", "4-6 years", "7-9 years", "10-12 years", "Teen (13-17)", "Adult (18+)", "All Ages"]', false, 5),
('bef41a67-abe5-43c7-b7f5-f48057365428', 'skillLevel', 'Skill Level', 'multi-select', 'product_details', 'SkillLevel', '["Beginner", "Intermediate", "Advanced", "Professional"]', false, 6),
('bef41a67-abe5-43c7-b7f5-f48057365428', 'playerCount', 'Player Count', 'multi-select', 'product_details', 'PlayerCount', '["1 Player (Solo)", "2 Players", "2-4 Players", "4-6 Players", "6+ Players"]', false, 7),
('bef41a67-abe5-43c7-b7f5-f48057365428', 'specialEdition', 'Special Edition', 'multi-select', 'product_details', 'SpecialEdition', '["First Edition", "Limited Edition", "Deluxe Edition", "Collector''s Edition", "Signed Copy", "Remastered", "Colored Vinyl"]', false, 8)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 8. FOOTWEAR (12345678-1234-5678-9abc-def012345678)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('12345678-1234-5678-9abc-def012345678', 'shoeType', 'Shoe Type', 'multi-select', 'product_details', 'ShoeType', '["Sneakers", "Casual Shoes", "Formal Shoes", "Boots", "Sandals", "Slippers", "Sports Shoes", "Loafers", "Heels", "Flats", "Espadrilles", "Ankle Boots", "Outdoor/Trekking", "Safety Shoes"]', false, 1),
('12345678-1234-5678-9abc-def012345678', 'gender', 'Gender', 'single-select', 'product_details', 'Gender', '["Women", "Men", "Unisex", "Kids (Boys)", "Kids (Girls)"]', false, 2),
('12345678-1234-5678-9abc-def012345678', 'material', 'Material', 'multi-select', 'product_details', 'Material', '["Genuine Leather", "Synthetic Leather", "Textile", "Canvas", "Mesh", "Suede", "Nubuck", "Rubber"]', false, 3),
('12345678-1234-5678-9abc-def012345678', 'soleMaterial', 'Sole Material', 'multi-select', 'product_details', 'SoleMaterial', '["Rubber", "EVA", "Polyurethane (PU)", "Thermoplastic Rubber (TPR)", "Leather"]', false, 4),
('12345678-1234-5678-9abc-def012345678', 'style', 'Style/Occasion', 'multi-select', 'product_details', 'Style', '["Daily Wear", "Sports/Running", "Formal/Business", "Outdoor/Hiking", "Indoor", "Beach", "Wedding/Special Events"]', false, 5),
('12345678-1234-5678-9abc-def012345678', 'features', 'Features', 'multi-select', 'product_details', 'Features', '["Waterproof", "Breathable", "Non-Slip", "Orthopedic", "Memory Foam", "Lightweight", "Steel Toe"]', false, 6),
('12345678-1234-5678-9abc-def012345678', 'heelType', 'Heel Type', 'multi-select', 'product_details', 'HeelType', '["Flat", "Low Heel (1-3cm)", "Mid Heel (4-7cm)", "High Heel (8cm+)", "Wedge", "Platform", "Stiletto"]', false, 7),
('12345678-1234-5678-9abc-def012345678', 'closureType', 'Closure Type', 'multi-select', 'product_details', 'ClosureType', '["Lace-Up", "Slip-On", "Velcro", "Zipper", "Buckle", "Elastic"]', false, 8),
('12345678-1234-5678-9abc-def012345678', 'season', 'Season', 'multi-select', 'product_details', 'Season', '["Spring/Summer", "Fall/Winter", "All-Season"]', false, 9)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 9. MOTHER, BABY & TOY (23456789-2345-6789-abcd-ef0123456789)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('23456789-2345-6789-abcd-ef0123456789', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Stroller", "Car Seat", "Baby Carrier", "Crib", "Changing Table", "Bottle", "High Chair", "Diapers", "Wipes", "Baby Monitor", "Thermometer", "Educational Toy", "Doll", "Desk", "Chair", "T-shirt", "Dress", "Romper"]', false, 1),
('23456789-2345-6789-abcd-ef0123456789', 'ageRange', 'Age Range', 'multi-select', 'product_details', 'AgeRange', '["0-3 Months", "3-6 Months", "6-12 Months", "1-2 Years", "2-3 Years", "3-5 Years", "5-7 Years", "7-12 Years"]', false, 2),
('23456789-2345-6789-abcd-ef0123456789', 'gender', 'Gender', 'single-select', 'product_details', 'Gender', '["Boy", "Girl", "Unisex"]', false, 3),
('23456789-2345-6789-abcd-ef0123456789', 'material', 'Material', 'multi-select', 'product_details', 'Material', '["Cotton", "Organic Cotton", "Polyester", "Plastic", "Wood", "Metal", "Fabric", "Silicone", "BPA-Free Plastic"]', false, 4),
('23456789-2345-6789-abcd-ef0123456789', 'features', 'Features', 'multi-select', 'product_details', 'Features', '["Convertible", "Foldable", "Portable", "Adjustable", "Washable", "Safety Certified", "Non-Toxic", "Hypoallergenic", "Waterproof", "Educational"]', false, 5),
('23456789-2345-6789-abcd-ef0123456789', 'safetyStandards', 'Safety Standards', 'multi-select', 'product_details', 'SafetyStandards', '["EN 1888 (Strollers)", "ECE R44/04 (Car Seats)", "ASTM Certified", "CE Certified"]', false, 6),
('23456789-2345-6789-abcd-ef0123456789', 'specialNeeds', 'Special Needs', 'multi-select', 'product_details', 'SpecialNeeds', '["Sensitive Skin", "Hypoallergenic", "Fragrance-Free", "Dermatologically Tested"]', false, 7)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 10. AUTO, HARDWARE & GARDEN (34567890-3456-7890-bcde-f01234567890)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('34567890-3456-7890-bcde-f01234567890', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Engine Parts", "Brake System", "Filters", "Tires", "Car Charger", "Seat Cover", "Dash Cam", "Motorcycle Helmet", "Gloves", "Drill", "Hammer", "Saw", "Screws", "Nails", "Switches", "Cables", "Pipes", "Faucets", "Paint", "Brushes"]', false, 1),
('34567890-3456-7890-bcde-f01234567890', 'vehicleType', 'Vehicle Type', 'multi-select', 'product_details', 'VehicleType', '["Car", "Motorcycle", "Truck", "SUV", "Van", "Universal"]', false, 2),
('34567890-3456-7890-bcde-f01234567890', 'vehicleMake', 'Vehicle Make', 'multi-select', 'product_details', 'VehicleMake', '["Toyota", "Honda", "Ford", "BMW", "Mercedes", "Volkswagen", "Hyundai", "Renault", "Fiat", "Peugeot", "Opel", "Audi", "Nissan", "Mazda", "Kia"]', false, 3),
('34567890-3456-7890-bcde-f01234567890', 'material', 'Material', 'multi-select', 'product_details', 'Material', '["Metal", "Steel", "Aluminum", "Plastic", "Rubber", "Copper", "PVC", "Brass", "Cast Iron"]', false, 4),
('34567890-3456-7890-bcde-f01234567890', 'partType', 'Part Type', 'multi-select', 'product_details', 'PartType', '["OEM (Original Equipment)", "Aftermarket", "Universal", "Genuine", "Compatible"]', false, 5),
('34567890-3456-7890-bcde-f01234567890', 'powerSource', 'Power Source', 'multi-select', 'product_details', 'PowerSource', '["Manual", "Electric (Corded)", "Battery-Powered (Cordless)", "Pneumatic", "Hydraulic", "Gas-Powered"]', false, 6),
('34567890-3456-7890-bcde-f01234567890', 'voltage', 'Voltage', 'multi-select', 'product_details', 'Voltage', '["12V", "18V", "20V", "220V", "110V"]', false, 7),
('34567890-3456-7890-bcde-f01234567890', 'power', 'Power', 'multi-select', 'product_details', 'Power', '["500W", "750W", "1000W", "1500W", "2000W+"]', false, 8),
('34567890-3456-7890-bcde-f01234567890', 'application', 'Application', 'multi-select', 'product_details', 'Application', '["Car", "Motorcycle", "Truck", "Home Use", "Professional/Industrial", "Construction"]', false, 9),
('34567890-3456-7890-bcde-f01234567890', 'certifications', 'Certifications', 'multi-select', 'product_details', 'Certifications', '["ISO Certified", "CE Certified", "DOT Approved"]', false, 10)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 11. PET SHOP (45678901-4567-8901-cdef-012345678901)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('45678901-4567-8901-cdef-012345678901', 'petType', 'Pet Type', 'multi-select', 'product_details', 'PetType', '["Dog", "Cat", "Bird", "Fish", "Small Animals (Rabbit, Hamster, Guinea Pig)", "Reptile"]', false, 1),
('45678901-4567-8901-cdef-012345678901', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Dry Food", "Wet Food", "Treats", "Chew Toy", "Interactive Toy", "Pet Bed", "Cat Tree", "Food Bowl", "Water Fountain", "Leash", "Collar", "Harness", "Brush", "Shampoo", "Vitamins", "Flea Treatment", "Cage", "Aquarium", "Litter Box", "Waste Bags"]', false, 2),
('45678901-4567-8901-cdef-012345678901', 'petSize', 'Pet Size', 'multi-select', 'product_details', 'PetSize', '["Extra Small (0-5kg)", "Small (5-10kg)", "Medium (10-20kg)", "Large (20-30kg)", "Extra Large (30kg+)"]', false, 3),
('45678901-4567-8901-cdef-012345678901', 'petAge', 'Pet Age', 'multi-select', 'product_details', 'PetAge', '["Puppy/Kitten", "Junior", "Adult", "Senior", "All Life Stages"]', false, 4),
('45678901-4567-8901-cdef-012345678901', 'material', 'Material', 'multi-select', 'product_details', 'Material', '["Plastic", "Fabric", "Rubber", "Stainless Steel", "Wood", "Leather", "Nylon", "Ceramic", "Glass"]', false, 5),
('45678901-4567-8901-cdef-012345678901', 'features', 'Features', 'multi-select', 'product_details', 'Features', '["Washable", "Waterproof", "Chew-Resistant", "Non-Toxic", "Foldable", "Adjustable", "Automatic", "Reflective", "Orthopedic"]', false, 6),
('45678901-4567-8901-cdef-012345678901', 'flavor', 'Flavor', 'multi-select', 'product_details', 'Flavor', '["Chicken", "Beef", "Fish", "Lamb", "Turkey", "Vegetarian", "Mixed"]', false, 7),
('45678901-4567-8901-cdef-012345678901', 'foodForm', 'Food Form', 'multi-select', 'product_details', 'FoodForm', '["Dry Food (Kibble)", "Wet Food (Canned)", "Semi-Moist", "Freeze-Dried", "Raw"]', false, 8),
('45678901-4567-8901-cdef-012345678901', 'specialDiet', 'Special Diet', 'multi-select', 'product_details', 'SpecialDiet', '["Grain-Free", "Organic", "Hypoallergenic", "Weight Management", "Sensitive Stomach", "High Protein", "Low Fat", "Dental Care"]', false, 9)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- =====================================================
-- 12. OFFICE & STATIONERY (56789012-5678-9012-def0-123456789012)
-- =====================================================
INSERT INTO category_filter_config (category_id, filter_key, filter_label, filter_type, data_source, data_path, options, is_required, display_order) VALUES
('56789012-5678-9012-def0-123456789012', 'productType', 'Product Type', 'multi-select', 'product_details', 'ProductType', '["Pen", "Pencil", "Marker", "Notebook", "Copy Paper", "Sticky Notes", "Binder", "Folder", "File Box", "Stapler", "Desk Organizer", "Calculator", "Office Chair", "Desk", "Paint", "Canvas", "Brush", "Backpack", "Lunch Box", "Whiteboard", "Poster Board"]', false, 1),
('56789012-5678-9012-def0-123456789012', 'bindingType', 'Binding Type', 'multi-select', 'product_details', 'BindingType', '["Spiral", "Hardbound", "Softbound", "Stapled", "Ring Binder (2-ring)", "Ring Binder (3-ring)", "Ring Binder (4-ring)"]', false, 2),
('56789012-5678-9012-def0-123456789012', 'paperType', 'Paper Type', 'multi-select', 'product_details', 'PaperType', '["Ruled/Lined", "Blank", "Grid/Graph", "Dotted", "Mixed"]', false, 3),
('56789012-5678-9012-def0-123456789012', 'material', 'Material', 'multi-select', 'product_details', 'Material', '["Paper", "Cardboard", "Plastic", "Metal", "Wood", "Fabric", "Leather"]', false, 4),
('56789012-5678-9012-def0-123456789012', 'usageType', 'Usage Type', 'multi-select', 'product_details', 'UsageType', '["Office", "School", "University", "Art/Creative", "Professional", "Home"]', false, 5),
('56789012-5678-9012-def0-123456789012', 'features', 'Features', 'multi-select', 'product_details', 'Features', '["Refillable", "Erasable", "Waterproof", "Recycled", "Acid-Free", "Archival Quality", "Perforated Pages", "Pocket Dividers"]', false, 6),
('56789012-5678-9012-def0-123456789012', 'inkType', 'Ink Type', 'multi-select', 'product_details', 'InkType', '["Ballpoint", "Gel", "Rollerball", "Fountain", "Permanent", "Erasable"]', false, 7),
('56789012-5678-9012-def0-123456789012', 'leadSize', 'Lead Size', 'multi-select', 'product_details', 'LeadSize', '["0.3mm", "0.5mm", "0.7mm", "0.9mm", "2mm"]', false, 8),
('56789012-5678-9012-def0-123456789012', 'gsm', 'Paper Weight (GSM)', 'multi-select', 'product_details', 'GSM', '["70 GSM", "80 GSM", "100 GSM", "120 GSM"]', false, 9)
ON CONFLICT (category_id, filter_key) DO NOTHING;

-- Enable RLS
ALTER TABLE category_filter_config ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Allow public read access on category_filter_config"
ON category_filter_config FOR SELECT
USING (true);

