-- =============================================================================
-- Replace category images that did not match their category, and serve every
-- tile as a pre-cropped thumbnail.
--
-- WHY: repoint_dead_category_images.sql rescued the tiles from the dead storage
-- bucket, but the replacement photos were only checked for HTTP 200 — nobody
-- looked at the pictures. Five of them showed the wrong subject entirely:
--
--   beauty-cosmetics  -> a pair of running shoes   (also duplicated `footwear`)
--   food-beverage     -> a bookshelf               (duplicated `books-media`)
--   home-furniture    -> hands forming a star
--   sports-outdoor    -> a supermarket trolley
--   office-stationery -> a 27-byte 404 body, so the tile fell back to the
--                        built-in placeholder
--
-- Each replacement below was downloaded and viewed at both 220px and the 96px
-- tile size the mobile homepage slider actually renders (HomepageSlider.tsx
-- uses w-24 h-24), because several otherwise-nice photos become an unreadable
-- smudge that small.
--
-- The ?auto=compress&w=600&h=600&fit=crop suffix is applied to EVERY row, not
-- just the replaced ones. Two reasons:
--   1. Size. The bare URLs served the originals — 1MB to 5.8MB each — for a
--      96px tile. Cropped they are 17KB to 91KB.
--   2. Framing. The tiles render inside `aspect-square` + object-cover, so the
--      browser was already centre-cropping to a square. Asking Pexels for the
--      square means the picture that was reviewed is the picture that renders.
-- All 13 cropped URLs were downloaded and checked; no subject is cut off.
--
-- Idempotent: re-running sets the same values. Matching is by slug, so a row
-- that has since been given the client's own artwork is overwritten — see the
-- rollback block at the bottom for the values this replaces.
-- =============================================================================

UPDATE categories SET image_url = CASE slug
    -- ---- replaced: the photo did not show the category -------------------
    -- a row of lip gloss tubes on a blue ground
    WHEN 'beauty-cosmetics'  THEN 'https://images.pexels.com/photos/29229006/pexels-photo-29229006.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    -- a fresh produce market stall
    WHEN 'food-beverage'     THEN 'https://images.pexels.com/photos/26870520/pexels-photo-26870520.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    -- a teal velvet sofa in a furnished living room
    WHEN 'home-furniture'    THEN 'https://images.pexels.com/photos/7546707/pexels-photo-7546707.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    -- trainers, dumbbells, resistance bands and suspension straps laid out
    WHEN 'sports-outdoor'    THEN 'https://images.pexels.com/photos/6740821/pexels-photo-6740821.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    -- sticky notes, highlighters and staples on a desk
    WHEN 'office-stationery' THEN 'https://images.pexels.com/photos/5554657/pexels-photo-5554657.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'

    -- ---- kept: same photo, now cropped and compressed ---------------------
    WHEN 'auto-hardware-garden' THEN 'https://images.pexels.com/photos/120049/pexels-photo-120049.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    WHEN 'books-media'          THEN 'https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    WHEN 'electronics'          THEN 'https://images.pexels.com/photos/1029757/pexels-photo-1029757.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    WHEN 'fashion'              THEN 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    WHEN 'footwear'             THEN 'https://images.pexels.com/photos/19090/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    WHEN 'mother-baby-toy'      THEN 'https://images.pexels.com/photos/1257110/pexels-photo-1257110.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'
    WHEN 'pet-shop'             THEN 'https://images.pexels.com/photos/4587992/pexels-photo-4587992.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop'

    ELSE image_url
  END
WHERE slug IN (
  'beauty-cosmetics','food-beverage','home-furniture','sports-outdoor',
  'office-stationery','auto-hardware-garden','books-media','electronics',
  'fashion','footwear','mother-baby-toy','pet-shop'
);

-- Verify: expect 12 rows, every image_url ending in fit=crop.
--   SELECT slug, image_url FROM categories ORDER BY slug;

-- NOT TOUCHED: the `sdfads` category. It is a test row left over from manual
-- testing and it is is_active = true, so it renders on the live homepage next
-- to the real categories. Deleting or deactivating it is a content decision,
-- not an image fix:
--   UPDATE categories SET is_active = false WHERE slug = 'sdfads';

-- -----------------------------------------------------------------------------
-- ROLLBACK — the exact values this migration replaced.
-- -----------------------------------------------------------------------------
-- UPDATE categories SET image_url = CASE slug
--     WHEN 'auto-hardware-garden' THEN 'https://images.pexels.com/photos/120049/pexels-photo-120049.jpeg'
--     WHEN 'beauty-cosmetics'     THEN 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg'
--     WHEN 'books-media'          THEN 'https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg'
--     WHEN 'electronics'          THEN 'https://images.pexels.com/photos/1029757/pexels-photo-1029757.jpeg'
--     WHEN 'fashion'              THEN 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg'
--     WHEN 'food-beverage'        THEN 'https://images.pexels.com/photos/1370295/pexels-photo-1370295.jpeg'
--     WHEN 'footwear'             THEN 'https://images.pexels.com/photos/19090/pexels-photo.jpg'
--     WHEN 'home-furniture'       THEN 'https://images.pexels.com/photos/1116302/pexels-photo-1116302.jpeg'
--     WHEN 'mother-baby-toy'      THEN 'https://images.pexels.com/photos/1257110/pexels-photo-1257110.jpeg'
--     WHEN 'office-stationery'    THEN 'https://images.pexels.com/photos/159304/pexels-photo-159304.jpeg'
--     WHEN 'pet-shop'             THEN 'https://images.pexels.com/photos/4587992/pexels-photo-4587992.jpeg'
--     WHEN 'sports-outdoor'       THEN 'https://images.pexels.com/photos/1005638/pexels-photo-1005638.jpeg'
--     ELSE image_url
--   END;
