-- Migration: link product images to retail product variations
--
-- Mirrors wholesale_pack_variations.image_indices. When a buyer picks a colour
-- on the retail product detail page, the gallery shows the images linked here
-- instead of the full image set.
--
-- Indices are 0-based positions into the product's own images ordered by
-- display_order, NOT image ids. Imports from wholesale copy images in
-- display_order, so the wholesale indices carry over unchanged.

ALTER TABLE retail_product_variations
ADD COLUMN IF NOT EXISTS image_indices INTEGER[] DEFAULT NULL;

COMMENT ON COLUMN retail_product_variations.image_indices IS
  '0-based indices into the product images ordered by display_order. When this variation is selected, the gallery shows these images in order. NULL/empty means "show all images".';
