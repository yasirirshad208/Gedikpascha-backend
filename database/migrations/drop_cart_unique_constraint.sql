-- Drop the unique constraint on (user_id, product_id, pack_size_id)
-- to allow multiple cart entries for the same product+pack with different selected_variations
-- (e.g., same T-shirt pack in Red and in Blue = two separate cart items)
ALTER TABLE wholesale_cart DROP CONSTRAINT IF EXISTS unique_user_product_pack;
