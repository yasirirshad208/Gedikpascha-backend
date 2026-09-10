-- =============================================================================
-- Repoint category images that were lost in the Supabase project migration.
--
-- WHY: category images were uploaded to Supabase Storage on the old project
-- (abzbxnpqcomijxuqvoqx). A database dump carries table rows but NOT storage
-- objects, so after moving to the new project those rows still pointed at a
-- bucket that no longer exists — the host does not even resolve any more.
-- Every category tile rendered blank, because the UI only falls back when
-- image_url is NULL, not when it is set but dead.
--
-- WHAT THIS DOES: replaces only the dead old-project URLs with free Pexels
-- photos (the same host `footwear` already uses, and one already allowed in
-- next.config.ts). Every URL below was checked and returns HTTP 200.
--
-- THESE ARE INTERIM STOCK PHOTOS chosen to stop the site looking broken. To
-- use the client's own artwork instead, update image_url for that row — or set
-- it to NULL to fall back to the built-in placeholder.
--
-- Safe to re-run: it only touches rows still pointing at the dead host.
-- =============================================================================

UPDATE categories SET image_url = CASE slug
    WHEN 'fashion'           THEN 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg'
    WHEN 'electronics'       THEN 'https://images.pexels.com/photos/1029757/pexels-photo-1029757.jpeg'
    WHEN 'home-furniture'    THEN 'https://images.pexels.com/photos/1116302/pexels-photo-1116302.jpeg'
    WHEN 'beauty-cosmetics'  THEN 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg'
    WHEN 'sports-outdoor'    THEN 'https://images.pexels.com/photos/1005638/pexels-photo-1005638.jpeg'
    WHEN 'food-beverage'     THEN 'https://images.pexels.com/photos/1370295/pexels-photo-1370295.jpeg'
    WHEN 'books-media'       THEN 'https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg'
    WHEN 'office-stationery' THEN 'https://images.pexels.com/photos/1181605/pexels-photo-1181605.jpeg'
    ELSE NULL
  END
WHERE image_url LIKE '%abzbxnpqcomijxuqvoqx.supabase.co%';

-- Any other row still pointing at the dead project (subcategories included)
-- falls back to the built-in placeholder rather than rendering blank.
UPDATE categories
   SET image_url = NULL
 WHERE image_url LIKE '%abzbxnpqcomijxuqvoqx.supabase.co%';

UPDATE subcategories
   SET image_url = NULL
 WHERE image_url LIKE '%abzbxnpqcomijxuqvoqx.supabase.co%';

-- Verify: expect 0 rows.
-- SELECT slug, image_url FROM categories WHERE image_url LIKE '%abzbxnpqcomijxuqvoqx%';
