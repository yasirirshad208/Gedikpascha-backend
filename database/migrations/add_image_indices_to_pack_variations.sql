-- Migration: Add multiple images per variation (image_indices array)
-- Allows linking multiple product images to one variation; product detail page shows these when variation is selected.

ALTER TABLE wholesale_pack_variations
ADD COLUMN IF NOT EXISTS image_indices INTEGER[] DEFAULT NULL;

-- Backfill: single image_index -> array with one element
UPDATE wholesale_pack_variations
SET image_indices = ARRAY[image_index]
WHERE image_index IS NOT NULL AND (image_indices IS NULL OR image_indices = '{}');

COMMENT ON COLUMN wholesale_pack_variations.image_indices IS '0-based indices of linked product images. When this variation is selected, the gallery shows these images in order.';
