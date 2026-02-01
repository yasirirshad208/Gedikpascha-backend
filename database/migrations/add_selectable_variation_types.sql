-- Migration: Add selectable variation types for fixed-quantity packs
-- When hasFixedQuantities=true, this specifies which variation types the BUYER can select.
-- Types NOT in this list are "fixed" (predetermined) - e.g. size mix 4M+4L+4XL.
-- Types IN this list are "selectable" - e.g. buyer picks color (White, Blue, Red).
-- Example: selectable_variation_types = ['color'] means buyer selects color, gets fixed size mix.

ALTER TABLE wholesale_product_pack_sizes
ADD COLUMN IF NOT EXISTS selectable_variation_types JSONB DEFAULT NULL;

COMMENT ON COLUMN wholesale_product_pack_sizes.selectable_variation_types IS 'When hasFixedQuantities=true: variation types the buyer can select (e.g. ["color"]). Other types are fixed. NULL = legacy: all types treated as fixed.';
