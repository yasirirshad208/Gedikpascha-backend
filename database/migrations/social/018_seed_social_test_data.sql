-- 018_seed_social_test_data.sql
-- Purpose:
--   Seed realistic social data for local/staging testing across:
--   profiles, follows, products, variations, attributes, posts, reels,
--   engagement, exchange, messages, notifications, and sales.
--
-- Notes:
--   1) Requires these user IDs in public.users:
--        ac35ab95-48f7-4593-b0f6-ab107da5b608
--        c1ac3db1-4ea5-4a18-836e-b46b6e5ed50a
--   2) Uses deterministic UUIDs so it is safe to run multiple times.
--   3) Retail-import seed is intentionally excluded because it depends on
--      existing retail order history shape and constraints.
--   4) Uses locked taxonomy IDs from your DB:
--        Fashion -> Women's Clothing -> Tops
--        Footwear -> Women's Footwear -> Sneakers

DO $$
DECLARE
  v_user_a UUID;
  v_user_b UUID;
  v_user_a_email TEXT;
  v_user_b_email TEXT;
  v_user_a_name TEXT;
  v_user_b_name TEXT;

  v_cat_1 UUID;
  v_sub_1 UUID;
  v_subsub_1 UUID;

  v_cat_2 UUID;
  v_sub_2 UUID;
  v_subsub_2 UUID;
BEGIN
  -- Locked test users provided by project owner.
  v_user_a := 'ac35ab95-48f7-4593-b0f6-ab107da5b608';
  v_user_b := 'c1ac3db1-4ea5-4a18-836e-b46b6e5ed50a';

  SELECT u.email, COALESCE(u.full_name, 'User A')
    INTO v_user_a_email, v_user_a_name
  FROM users u
  WHERE u.id = v_user_a;

  SELECT u.email, COALESCE(u.full_name, 'User B')
    INTO v_user_b_email, v_user_b_name
  FROM users u
  WHERE u.id = v_user_b;

  IF v_user_a_email IS NULL THEN
    RAISE EXCEPTION 'Seed user A not found in users table: %', v_user_a;
  END IF;

  IF v_user_b_email IS NULL THEN
    RAISE EXCEPTION 'Seed user B not found in users table: %', v_user_b;
  END IF;

  IF v_user_a = v_user_b THEN
    RAISE EXCEPTION 'Seed user IDs must be different';
  END IF;

  -- Locked taxonomy from your current DB snapshot:
  -- Category 1: Fashion -> Women's Clothing -> Tops
  v_cat_1 := '17c0908d-8a86-4c04-873d-92648db61a2f';
  v_sub_1 := 'c9998e11-72ad-420f-b859-276f0fb4457c';
  v_subsub_1 := 'efbce18b-3e8e-4406-be57-5f4246b41e7e';

  -- Category 2: Footwear -> Women's Footwear -> Sneakers
  v_cat_2 := '12345678-1234-5678-9abc-def012345678';
  v_sub_2 := '03fe2279-abc2-4880-856c-5b2012e4a072';
  v_subsub_2 := 'a40fb99b-ab1e-444e-bcda-f3f8ab69c2db';

  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = v_cat_1) THEN
    RAISE EXCEPTION 'Seed category not found: %', v_cat_1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = v_cat_2) THEN
    RAISE EXCEPTION 'Seed category not found: %', v_cat_2;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM subcategories
    WHERE id = v_sub_1 AND category_id = v_cat_1
  ) THEN
    RAISE EXCEPTION 'Seed subcategory mismatch or missing: %', v_sub_1;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM subcategories
    WHERE id = v_sub_2 AND category_id = v_cat_2
  ) THEN
    RAISE EXCEPTION 'Seed subcategory mismatch or missing: %', v_sub_2;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM sub_subcategories
    WHERE id = v_subsub_1 AND subcategory_id = v_sub_1
  ) THEN
    RAISE EXCEPTION 'Seed sub-subcategory mismatch or missing: %', v_subsub_1;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM sub_subcategories
    WHERE id = v_subsub_2 AND subcategory_id = v_sub_2
  ) THEN
    RAISE EXCEPTION 'Seed sub-subcategory mismatch or missing: %', v_subsub_2;
  END IF;

  INSERT INTO social_profiles (
    user_id,
    username,
    display_name,
    avatar_url,
    bio,
    is_private
  )
  VALUES
  (
    v_user_a,
    social_generate_username(v_user_a_email, v_user_a),
    v_user_a_name,
    'https://api.dicebear.com/7.x/thumbs/svg?seed=social-user-a',
    'Curated closet and daily social listings.',
    false
  ),
  (
    v_user_b,
    social_generate_username(v_user_b_email, v_user_b),
    v_user_b_name,
    'https://api.dicebear.com/7.x/thumbs/svg?seed=social-user-b',
    'Creator, collector, and swap enthusiast.',
    false
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO social_notification_preferences (user_id)
  VALUES (v_user_a), (v_user_b)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO social_follows (id, follower_id, following_id, created_at)
  VALUES
    ('a1111111-1111-1111-1111-111111111111', v_user_a, v_user_b, NOW() - INTERVAL '9 days'),
    ('b2222222-2222-2222-2222-222222222222', v_user_b, v_user_a, NOW() - INTERVAL '8 days')
  ON CONFLICT (follower_id, following_id) DO NOTHING;

  INSERT INTO social_products (
    id, seller_id, title, slug, description, brand, condition,
    category_id, subcategory_id, sub_subcategory_id,
    listing_type, source_type, status,
    currency, price, quantity, available_quantity,
    is_exchangeable, allow_offers,
    city, country, published_at, created_at, updated_at
  )
  VALUES
  (
    '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    v_user_a,
    'Seed Urban Jacket',
    'seed-urban-jacket-a1',
    'Seed product for shop testing flow.',
    'SeedBrand',
    'like-new',
    v_cat_1, v_sub_1, v_subsub_1,
    'shop', 'manual', 'active',
    'USD', 89.00, 6, 6,
    true, true,
    'Istanbul', 'Turkey',
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '8 days',
    NOW() - INTERVAL '7 days'
  ),
  (
    '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    v_user_a,
    'Seed Leather Crossbody',
    'seed-leather-crossbody-a2',
    'Seed product for closet and exchange testing.',
    'SeedBrand',
    'good',
    v_cat_1, v_sub_1, v_subsub_1,
    'closet', 'manual', 'active',
    'USD', 55.00, 1, 1,
    true, true,
    'Istanbul', 'Turkey',
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '6 days'
  ),
  (
    '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    v_user_b,
    'Seed Trail Sneakers',
    'seed-trail-sneakers-b3',
    'Seed product for reel tags and swap proposal testing.',
    'TrailCo',
    'good',
    v_cat_2, v_sub_2, v_subsub_2,
    'closet', 'manual', 'active',
    'USD', 72.00, 2, 2,
    true, true,
    'Ankara', 'Turkey',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '5 days'
  )
  ON CONFLICT (id) DO UPDATE SET
    seller_id = EXCLUDED.seller_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    brand = EXCLUDED.brand,
    condition = EXCLUDED.condition,
    category_id = EXCLUDED.category_id,
    subcategory_id = EXCLUDED.subcategory_id,
    sub_subcategory_id = EXCLUDED.sub_subcategory_id,
    listing_type = EXCLUDED.listing_type,
    status = EXCLUDED.status,
    price = EXCLUDED.price,
    quantity = EXCLUDED.quantity,
    available_quantity = EXCLUDED.available_quantity,
    is_exchangeable = EXCLUDED.is_exchangeable,
    allow_offers = EXCLUDED.allow_offers,
    city = EXCLUDED.city,
    country = EXCLUDED.country,
    published_at = EXCLUDED.published_at,
    updated_at = NOW();

  INSERT INTO social_product_media (id, product_id, media_url, media_type, display_order, is_primary, created_at)
  VALUES
    ('31111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200', 'image', 0, true, NOW() - INTERVAL '8 days'),
    ('31111111-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200', 'image', 1, false, NOW() - INTERVAL '8 days'),
    ('31111111-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=1200', 'image', 0, true, NOW() - INTERVAL '7 days'),
    ('32222222-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200', 'image', 0, true, NOW() - INTERVAL '6 days')
  ON CONFLICT (id) DO UPDATE SET
    media_url = EXCLUDED.media_url,
    media_type = EXCLUDED.media_type,
    display_order = EXCLUDED.display_order,
    is_primary = EXCLUDED.is_primary;

  INSERT INTO social_product_variations (
    id, product_id, variation_name, variation_type, variation_values, variation_options, display_order
  )
  VALUES
    (
      '41111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'Size',
      'text',
      ARRAY['S', 'M', 'L', 'XL'],
      '[{"label":"S","value":"S"},{"label":"M","value":"M"},{"label":"L","value":"L"},{"label":"XL","value":"XL"}]'::jsonb,
      0
    ),
    (
      '41111111-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'Color',
      'color',
      ARRAY['#111111', '#6b7280', '#f4f4f5'],
      '[{"label":"Black","value":"#111111"},{"label":"Slate","value":"#6b7280"},{"label":"Ice","value":"#f4f4f5"}]'::jsonb,
      1
    ),
    (
      '42222222-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
      '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
      'Color',
      'color',
      ARRAY['#ef4444', '#0ea5e9'],
      '[{"label":"Red","value":"#ef4444"},{"label":"Sky","value":"#0ea5e9"}]'::jsonb,
      0
    )
  ON CONFLICT (id) DO UPDATE SET
    variation_name = EXCLUDED.variation_name,
    variation_type = EXCLUDED.variation_type,
    variation_values = EXCLUDED.variation_values,
    variation_options = EXCLUDED.variation_options,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

  INSERT INTO social_product_attributes (product_id, key, value)
  VALUES
    ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'shipping_method', 'Standard + Express'),
    ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'shipping_cost', '6.5'),
    ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'handling_time_days', '1'),
    ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'return_policy', 'Returns accepted within 7 days in original condition.'),
    ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'additional_details_json', '[{"key":"Material","value":"Polyester Blend"},{"key":"Fit","value":"Regular"}]'),
    ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'shipping_method', 'Pickup or local courier'),
    ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'shipping_info', 'Ships in 24h after confirmation.'),
    ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'shipping_method', 'Standard Shipping'),
    ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'shipping_cost', '5.0')
  ON CONFLICT (product_id, key) DO UPDATE SET
    value = EXCLUDED.value;

  INSERT INTO social_posts (
    id, user_id, caption, location_text, hashtags, category_id, status,
    is_comments_enabled, published_at, created_at, updated_at
  )
  VALUES
    (
      '51111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_a,
      'Weekend fit check with my seed urban jacket.',
      'Istanbul',
      ARRAY['#streetwear', '#socialseed'],
      v_cat_1,
      'published',
      true,
      NOW() - INTERVAL '4 days',
      NOW() - INTERVAL '4 days',
      NOW() - INTERVAL '4 days'
    ),
    (
      '52222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      v_user_b,
      'New arrivals in my closet collection.',
      'Ankara',
      ARRAY['#closet', '#style'],
      v_cat_2,
      'published',
      true,
      NOW() - INTERVAL '3 days',
      NOW() - INTERVAL '3 days',
      NOW() - INTERVAL '3 days'
    )
  ON CONFLICT (id) DO UPDATE SET
    caption = EXCLUDED.caption,
    location_text = EXCLUDED.location_text,
    hashtags = EXCLUDED.hashtags,
    status = EXCLUDED.status,
    published_at = EXCLUDED.published_at,
    updated_at = NOW();

  INSERT INTO social_post_media (
    id, post_id, media_url, media_type, thumbnail_url, width, height, display_order, created_at
  )
  VALUES
    (
      '61111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '51111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1200',
      'image',
      NULL,
      1080,
      1350,
      0,
      NOW() - INTERVAL '4 days'
    ),
    (
      '62222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      '52222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200',
      'image',
      NULL,
      1080,
      1080,
      0,
      NOW() - INTERVAL '3 days'
    )
  ON CONFLICT (id) DO UPDATE SET
    media_url = EXCLUDED.media_url,
    media_type = EXCLUDED.media_type,
    thumbnail_url = EXCLUDED.thumbnail_url,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    display_order = EXCLUDED.display_order;

  INSERT INTO social_reels (
    id, user_id, caption, category_id, status,
    views_count, likes_count, comments_count, saves_count, shares_count,
    watch_completion_avg, engagement_rate, product_click_through, quality_score,
    published_at, created_at, updated_at
  )
  VALUES
    (
      '71111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_b,
      'Quick trail sneaker lookbook.',
      v_cat_2,
      'published',
      0, 0, 0, 0, 0,
      0.0, 0.0, 0.0, 0.74,
      NOW() - INTERVAL '2 days',
      NOW() - INTERVAL '2 days',
      NOW() - INTERVAL '2 days'
    )
  ON CONFLICT (id) DO UPDATE SET
    caption = EXCLUDED.caption,
    category_id = EXCLUDED.category_id,
    status = EXCLUDED.status,
    quality_score = EXCLUDED.quality_score,
    published_at = EXCLUDED.published_at,
    updated_at = NOW();

  INSERT INTO social_reel_media (
    id, reel_id, reel_url, thumbnail_url, duration_seconds, width, height, created_at
  )
  VALUES
    (
      '81111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '71111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'https://cdn.coverr.co/videos/coverr-young-girl-running-in-the-city-1579/1080p.mp4',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200',
      18,
      1080,
      1920,
      NOW() - INTERVAL '2 days'
    )
  ON CONFLICT (id) DO UPDATE SET
    reel_url = EXCLUDED.reel_url,
    thumbnail_url = EXCLUDED.thumbnail_url,
    duration_seconds = EXCLUDED.duration_seconds,
    width = EXCLUDED.width,
    height = EXCLUDED.height;

  INSERT INTO social_content_product_tags (
    id, content_type, content_id, product_id, tagger_user_id, created_at
  )
  VALUES
    ('91111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'post', '51111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_user_a, NOW() - INTERVAL '4 days'),
    ('92222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'reel', '71111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb3', v_user_b, NOW() - INTERVAL '2 days')
  ON CONFLICT (content_type, content_id, product_id) DO NOTHING;

  INSERT INTO social_likes (id, user_id, content_type, content_id, created_at)
  VALUES
    ('a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_user_b, 'post', '51111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', NOW() - INTERVAL '3 days'),
    ('a2222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2', v_user_a, 'reel', '71111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', NOW() - INTERVAL '1 day'),
    ('a3333333-cccc-4ccc-8ccc-ccccccccccc3', v_user_b, 'product', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', NOW() - INTERVAL '2 days')
  ON CONFLICT (user_id, content_type, content_id) DO NOTHING;

  INSERT INTO social_saves (id, user_id, content_type, content_id, created_at)
  VALUES
    ('b1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_user_b, 'product', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', NOW() - INTERVAL '2 days'),
    ('b2222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2', v_user_a, 'reel', '71111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', NOW() - INTERVAL '1 day')
  ON CONFLICT (user_id, content_type, content_id) DO NOTHING;

  INSERT INTO social_comments (id, parent_comment_id, user_id, content_type, content_id, body, likes_count, created_at, updated_at)
  VALUES
    ('c1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', NULL, v_user_b, 'post', '51111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Nice look, clean styling.', 0, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
    ('c2222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2', NULL, v_user_a, 'reel', '71111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Great edit and motion!', 0, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO social_shares (id, user_id, content_type, content_id, channel, created_at)
  VALUES
    ('d1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_user_b, 'post', '51111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'copy_link', NOW() - INTERVAL '2 days'),
    ('d2222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2', v_user_a, 'reel', '71111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'copy_link', NOW() - INTERVAL '1 day')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO social_views (id, viewer_id, session_key, content_type, content_id, watch_seconds, completion_ratio, created_at)
  VALUES
    ('e1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_user_b, 'seed-session-1', 'post', '51111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 8, 1.0000, NOW() - INTERVAL '3 days'),
    ('e2222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2', v_user_a, 'seed-session-2', 'reel', '71111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 16, 0.9200, NOW() - INTERVAL '1 day'),
    ('e3333333-cccc-4ccc-8ccc-ccccccccccc3', v_user_b, 'seed-session-3', 'product', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 12, 1.0000, NOW() - INTERVAL '2 days')
  ON CONFLICT (id) DO NOTHING;

  PERFORM social_refresh_content_counters('post', '51111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid);
  PERFORM social_refresh_content_counters('reel', '71111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid);
  PERFORM social_refresh_content_counters('product', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid);

  INSERT INTO social_swap_listings (
    id, owner_id, offered_product_id, title, description,
    wanted_category_id, wanted_subcategory_id, wanted_sub_subcategory_id,
    wanted_description, wanted_min_value, wanted_max_value, offered_value,
    is_cash_top_up_allowed, status, proposal_count, views_count, expires_at, created_at, updated_at
  )
  VALUES
    (
      'f1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_a,
      '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'Swap my crossbody for sneakers',
      'Looking for trail sneakers in good condition.',
      v_cat_2,
      v_sub_2,
      v_subsub_2,
      'Open to alternative footwear offers.',
      50.00,
      90.00,
      55.00,
      true,
      'accepted',
      1,
      18,
      NOW() + INTERVAL '10 days',
      NOW() - INTERVAL '2 days',
      NOW() - INTERVAL '1 day'
    )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    proposal_count = EXCLUDED.proposal_count,
    views_count = EXCLUDED.views_count,
    updated_at = NOW();

  INSERT INTO social_swap_wants (id, listing_id, category_id, subcategory_id, sub_subcategory_id, notes, display_order, created_at)
  VALUES
    ('f2111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'f1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_cat_2, v_sub_2, v_subsub_2, 'Preferred trail/running styles', 0, NOW() - INTERVAL '2 days')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO social_swap_proposals (
    id, listing_id, proposer_id, offered_product_id, offered_value, cash_top_up, message, status, created_at, updated_at
  )
  VALUES
    (
      'f3111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'f1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_b,
      '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
      72.00,
      0,
      'I can swap these trail sneakers directly.',
      'accepted',
      NOW() - INTERVAL '1 day',
      NOW() - INTERVAL '1 day'
    )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    updated_at = NOW();

  INSERT INTO social_swap_transactions (
    id, listing_id, accepted_proposal_id, owner_id, proposer_id, status,
    inspection_ends_at, created_at, updated_at
  )
  VALUES
    (
      'f4111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'f1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'f3111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_a,
      v_user_b,
      'in_transit',
      NOW() + INTERVAL '4 days',
      NOW() - INTERVAL '20 hours',
      NOW() - INTERVAL '2 hours'
    )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    inspection_ends_at = EXCLUDED.inspection_ends_at,
    updated_at = NOW();

  INSERT INTO social_swap_shipments (
    id, transaction_id, shipper_id, carrier, tracking_number, status,
    shipped_at, delivered_at, confirmed_at, created_at, updated_at
  )
  VALUES
    (
      'f5111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'f4111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_a,
      'Yurtici',
      'TRK-SEED-001-A',
      'in_transit',
      NOW() - INTERVAL '15 hours',
      NULL,
      NULL,
      NOW() - INTERVAL '15 hours',
      NOW() - INTERVAL '2 hours'
    ),
    (
      'f5222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      'f4111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_b,
      'MNG',
      'TRK-SEED-001-B',
      'label_created',
      NULL,
      NULL,
      NULL,
      NOW() - INTERVAL '12 hours',
      NOW() - INTERVAL '2 hours'
    )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    tracking_number = EXCLUDED.tracking_number,
    updated_at = NOW();

  INSERT INTO social_swap_timeline (id, transaction_id, event_type, actor_id, payload, created_at)
  VALUES
    ('f6111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'f4111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'swap_accepted', v_user_a, '{"note":"Proposal accepted"}'::jsonb, NOW() - INTERVAL '20 hours'),
    ('f6222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'f4111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'owner_shipped', v_user_a, '{"tracking":"TRK-SEED-001-A"}'::jsonb, NOW() - INTERVAL '15 hours')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO social_threads (
    id, title, related_swap_listing_id, related_swap_transaction_id, created_by,
    last_message_preview, last_message_at, created_at, updated_at
  )
  VALUES
    (
      'a7111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'Swap: Crossbody <-> Sneakers',
      'f1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'f4111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_a,
      'I just dropped mine at the carrier.',
      NOW() - INTERVAL '6 hours',
      NOW() - INTERVAL '20 hours',
      NOW() - INTERVAL '6 hours'
    )
  ON CONFLICT (id) DO UPDATE SET
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_at = EXCLUDED.last_message_at,
    updated_at = NOW();

  INSERT INTO social_thread_participants (id, thread_id, user_id, last_read_at, is_muted, created_at)
  VALUES
    ('a8111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'a7111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_user_a, NOW() - INTERVAL '5 hours', false, NOW() - INTERVAL '20 hours'),
    ('a8222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'a7111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_user_b, NOW() - INTERVAL '10 hours', false, NOW() - INTERVAL '20 hours')
  ON CONFLICT (thread_id, user_id) DO UPDATE SET
    last_read_at = EXCLUDED.last_read_at,
    is_muted = EXCLUDED.is_muted;

  INSERT INTO social_messages (
    id, thread_id, sender_id, message_type, body, metadata, created_at, updated_at
  )
  VALUES
    (
      'a9111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'a7111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_a,
      'system',
      'Swap accepted. Coordinate shipment details here.',
      '{"transaction_id":"f4111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}'::jsonb,
      NOW() - INTERVAL '20 hours',
      NOW() - INTERVAL '20 hours'
    ),
    (
      'a9222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      'a7111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_a,
      'shipping_card',
      'I just dropped mine at the carrier.',
      '{"carrier":"Yurtici","tracking_number":"TRK-SEED-001-A","status":"in_transit"}'::jsonb,
      NOW() - INTERVAL '6 hours',
      NOW() - INTERVAL '6 hours'
    ),
    (
      'a9333333-cccc-4ccc-8ccc-ccccccccccc3',
      'a7111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_b,
      'text',
      'Perfect, I will ship tomorrow morning.',
      NULL,
      NOW() - INTERVAL '5 hours',
      NOW() - INTERVAL '5 hours'
    )
  ON CONFLICT (id) DO UPDATE SET
    body = EXCLUDED.body,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

  INSERT INTO social_message_events (id, thread_id, message_id, event_type, actor_id, payload, created_at)
  VALUES
    (
      'ab111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'a7111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'a9222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      'shipment_shared',
      v_user_a,
      '{"tracking_number":"TRK-SEED-001-A"}'::jsonb,
      NOW() - INTERVAL '6 hours'
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO social_notifications (id, user_id, type, title, body, metadata, is_read, read_at, created_at)
  VALUES
    (
      'ac111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_a,
      'proposal_accepted',
      'Proposal accepted',
      'Your swap listing accepted a proposal.',
      '{"listing_id":"f1111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}'::jsonb,
      false,
      NULL,
      NOW() - INTERVAL '1 day'
    ),
    (
      'ac222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      v_user_b,
      'new_follower',
      'New follower',
      'Someone started following you.',
      jsonb_build_object('actor_user_id', v_user_a::text),
      true,
      NOW() - INTERVAL '8 hours',
      NOW() - INTERVAL '1 day'
    ),
    (
      'ac333333-cccc-4ccc-8ccc-ccccccccccc3',
      v_user_b,
      'message',
      'New message in swap chat',
      'I just dropped mine at the carrier.',
      '{"thread_id":"a7111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}'::jsonb,
      false,
      NULL,
      NOW() - INTERVAL '6 hours'
    )
  ON CONFLICT (id) DO UPDATE SET
    is_read = EXCLUDED.is_read,
    read_at = EXCLUDED.read_at,
    created_at = EXCLUDED.created_at;

  INSERT INTO social_sales_orders (
    id, order_number, buyer_id, seller_id, status,
    subtotal, shipping_cost, total_amount, currency,
    shipping_address, notes, created_at, updated_at, shipped_at, delivered_at
  )
  VALUES
    (
      'ad111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'SOSEED0001',
      v_user_b,
      v_user_a,
      'shipped',
      89.00,
      6.50,
      95.50,
      'USD',
      '{"fullName":"Seed Buyer","line1":"Seed Street 12","city":"Ankara","country":"Turkey"}'::jsonb,
      'Seed social sales order for testing.',
      NOW() - INTERVAL '36 hours',
      NOW() - INTERVAL '2 hours',
      NOW() - INTERVAL '4 hours',
      NULL
    )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    subtotal = EXCLUDED.subtotal,
    shipping_cost = EXCLUDED.shipping_cost,
    total_amount = EXCLUDED.total_amount,
    updated_at = NOW(),
    shipped_at = EXCLUDED.shipped_at;

  INSERT INTO social_sales_order_items (
    id, order_id, product_id, product_snapshot, quantity, unit_price, total_price, created_at
  )
  VALUES
    (
      'ad211111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'ad111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '{"title":"Seed Urban Jacket","price":89,"currency":"USD"}'::jsonb,
      1,
      89.00,
      89.00,
      NOW() - INTERVAL '36 hours'
    )
  ON CONFLICT (id) DO UPDATE SET
    product_snapshot = EXCLUDED.product_snapshot,
    quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price,
    total_price = EXCLUDED.total_price;

  INSERT INTO social_sales_shipments (
    id, order_id, shipper_id, carrier, tracking_number, status, metadata, created_at, updated_at
  )
  VALUES
    (
      'ad311111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'ad111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_user_a,
      'Aras',
      'SOC-SHIP-0001',
      'in_transit',
      '{"eta":"2 days"}'::jsonb,
      NOW() - INTERVAL '5 hours',
      NOW() - INTERVAL '2 hours'
    )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    tracking_number = EXCLUDED.tracking_number,
    updated_at = NOW();

  INSERT INTO social_sales_events (id, order_id, event_type, actor_id, payload, created_at)
  VALUES
    (
      'ad411111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'ad111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'order_created',
      v_user_b,
      '{"source":"seed"}'::jsonb,
      NOW() - INTERVAL '36 hours'
    ),
    (
      'ad422222-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      'ad111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'order_shipped',
      v_user_a,
      '{"tracking_number":"SOC-SHIP-0001"}'::jsonb,
      NOW() - INTERVAL '4 hours'
    )
  ON CONFLICT (id) DO NOTHING;

  UPDATE social_profiles
  SET
    rating_avg = GREATEST(COALESCE(rating_avg, 0), 4.6),
    response_rate = GREATEST(COALESCE(response_rate, 0), 92),
    seller_reputation = GREATEST(COALESCE(seller_reputation, 0), 85),
    sales_count = GREATEST(COALESCE(sales_count, 0), 1),
    swaps_completed = GREATEST(COALESCE(swaps_completed, 0), 1),
    updated_at = NOW()
  WHERE user_id IN (v_user_a, v_user_b);
END $$;
