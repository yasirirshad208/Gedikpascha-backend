-- 013_create_social_ranking_functions.sql

CREATE OR REPLACE FUNCTION social_distance_km(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  dlat DOUBLE PRECISION;
  dlon DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
  earth_radius_km CONSTANT DOUBLE PRECISION := 6371;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;

  dlat := RADIANS(lat2 - lat1);
  dlon := RADIANS(lon2 - lon1);

  a := SIN(dlat / 2) * SIN(dlat / 2)
       + COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * SIN(dlon / 2) * SIN(dlon / 2);
  c := 2 * ATAN2(SQRT(a), SQRT(1 - a));

  RETURN earth_radius_km * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION social_reels_ranked(
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_cursor_score NUMERIC DEFAULT NULL,
  p_cursor_created_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE(
  reel_id UUID,
  score NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      sr.id,
      sr.user_id,
      sr.category_id,
      sr.created_at,
      sr.views_count,
      GREATEST(0, LEAST(1, sr.watch_completion_avg)) AS watch_completion,
      GREATEST(0, sr.engagement_rate) AS engagement_rate,
      GREATEST(0, sr.product_click_through) AS product_ctr,
      GREATEST(0, LEAST(1, sr.quality_score)) AS quality_score,
      GREATEST(0, LEAST(1, COALESCE(sp.seller_reputation, 0) / 100.0)) AS seller_trust,
      CASE
        WHEN p_user_id IS NULL THEN 0
        WHEN EXISTS (
          SELECT 1 FROM social_follows sf
          WHERE sf.follower_id = p_user_id AND sf.following_id = sr.user_id
        ) THEN 1
        ELSE 0
      END AS creator_affinity,
      EXP(-EXTRACT(EPOCH FROM (NOW() - sr.created_at)) / 3600.0 / 48.0) AS freshness,
      CASE WHEN sr.views_count < 500 THEN 1 ELSE 0 END AS low_exposure
    FROM social_reels sr
    LEFT JOIN social_profiles sp ON sp.user_id = sr.user_id
    WHERE sr.status = 'published'
  ),
  scored AS (
    SELECT
      b.id,
      b.user_id,
      b.category_id,
      b.created_at,
      (
        0.30 * b.watch_completion +
        0.22 * b.engagement_rate +
        0.16 * b.freshness +
        0.12 * b.creator_affinity +
        0.10 * b.product_ctr +
        0.06 * b.quality_score +
        0.04 * b.seller_trust +
        CASE WHEN b.low_exposure = 1 THEN 0.03 ELSE 0 END
      )::NUMERIC AS score
    FROM base b
  ),
  constrained AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.score DESC, s.created_at DESC, s.id DESC) AS creator_rank,
      ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY s.score DESC, s.created_at DESC, s.id DESC) AS category_rank
    FROM scored s
  ),
  filtered AS (
    SELECT c.*
    FROM constrained c
    WHERE c.creator_rank <= 2
      AND c.category_rank <= GREATEST(1, CEIL(p_limit * 0.35)::INT)
      AND (
        p_cursor_score IS NULL
        OR c.score < p_cursor_score
        OR (c.score = p_cursor_score AND c.created_at < p_cursor_created_at)
        OR (c.score = p_cursor_score AND c.created_at = p_cursor_created_at AND c.id < p_cursor_id)
      )
  )
  SELECT f.id, f.score, f.created_at
  FROM filtered f
  ORDER BY f.score DESC, f.created_at DESC, f.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION social_products_ranked(
  p_user_id UUID DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_listing_type VARCHAR DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_subcategory_id UUID DEFAULT NULL,
  p_sub_subcategory_id UUID DEFAULT NULL,
  p_min_price NUMERIC DEFAULT NULL,
  p_max_price NUMERIC DEFAULT NULL,
  p_radius_km NUMERIC DEFAULT NULL,
  p_user_lat DOUBLE PRECISION DEFAULT NULL,
  p_user_lng DOUBLE PRECISION DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_cursor_score NUMERIC DEFAULT NULL,
  p_cursor_created_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE(
  product_id UUID,
  score NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      sp.*,
      sprof.seller_reputation,
      social_distance_km(p_user_lat, p_user_lng, sp.latitude, sp.longitude) AS distance_km,
      ts_rank(
        to_tsvector('simple', COALESCE(sp.title, '') || ' ' || COALESCE(sp.description, '')),
        plainto_tsquery('simple', COALESCE(NULLIF(p_query, ''), sp.title))
      ) AS text_rank
    FROM social_products sp
    LEFT JOIN social_profiles sprof ON sprof.user_id = sp.seller_id
    WHERE sp.status = 'active'
      AND (p_listing_type IS NULL OR sp.listing_type = p_listing_type)
      AND (p_category_id IS NULL OR sp.category_id = p_category_id)
      AND (p_subcategory_id IS NULL OR sp.subcategory_id = p_subcategory_id)
      AND (p_sub_subcategory_id IS NULL OR sp.sub_subcategory_id = p_sub_subcategory_id)
      AND (p_min_price IS NULL OR sp.price >= p_min_price)
      AND (p_max_price IS NULL OR sp.price <= p_max_price)
      AND (p_radius_km IS NULL OR social_distance_km(p_user_lat, p_user_lng, sp.latitude, sp.longitude) <= p_radius_km)
      AND (p_query IS NULL OR p_query = '' OR to_tsvector('simple', COALESCE(sp.title, '') || ' ' || COALESCE(sp.description, '')) @@ plainto_tsquery('simple', p_query))
  ),
  stats AS (
    SELECT
      f.*,
      COALESCE(
        (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY p2.price)
          FROM social_products p2
          WHERE p2.status = 'active'
            AND p2.category_id = f.category_id
        ),
        f.price
      ) AS category_median_price
    FROM filtered f
  ),
  scored AS (
    SELECT
      s.id,
      s.created_at,
      (
        0.24 * GREATEST(0, LEAST(1, COALESCE(s.text_rank, 0))) +
        0.20 * CASE
          WHEN s.distance_km IS NULL OR p_radius_km IS NULL THEN 0.5
          ELSE GREATEST(0, LEAST(1, 1 - (s.distance_km / NULLIF(p_radius_km::DOUBLE PRECISION, 0))))
        END +
        0.16 * CASE
          WHEN s.category_median_price <= 0 THEN 0.5
          ELSE GREATEST(0, LEAST(1, 1 - ABS((s.price - s.category_median_price) / s.category_median_price)))
        END +
        0.14 * CASE LOWER(COALESCE(s.condition, 'good'))
          WHEN 'new' THEN 1
          WHEN 'like-new' THEN 0.85
          WHEN 'like new' THEN 0.85
          WHEN 'good' THEN 0.65
          ELSE 0.45
        END +
        0.12 * GREATEST(0, LEAST(1, COALESCE(s.seller_reputation, 0) / 100.0)) +
        0.08 * EXP(-EXTRACT(EPOCH FROM (NOW() - s.created_at)) / 3600.0 / 168.0) +
        0.06 * GREATEST(0, LEAST(1, ((s.likes_count + s.saves_count + s.shares_count)::NUMERIC / NULLIF(s.views_count, 0))))
      )::NUMERIC AS score
    FROM stats s
  )
  SELECT sc.id, sc.score, sc.created_at
  FROM scored sc
  WHERE (
    p_cursor_score IS NULL
    OR sc.score < p_cursor_score
    OR (sc.score = p_cursor_score AND sc.created_at < p_cursor_created_at)
    OR (sc.score = p_cursor_score AND sc.created_at = p_cursor_created_at AND sc.id < p_cursor_id)
  )
  ORDER BY sc.score DESC, sc.created_at DESC, sc.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION social_home_feed_ranked(
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_cursor_created_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE(
  content_type VARCHAR,
  content_id UUID,
  score NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  posts_limit INTEGER;
  reels_limit INTEGER;
  products_limit INTEGER;
BEGIN
  posts_limit := GREATEST(1, ROUND(p_limit * 0.40));
  reels_limit := GREATEST(1, ROUND(p_limit * 0.35));
  products_limit := GREATEST(1, p_limit - posts_limit - reels_limit);

  RETURN QUERY
  WITH post_candidates AS (
    SELECT
      'post'::VARCHAR AS content_type,
      sp.id AS content_id,
      (
        0.34 * CASE
          WHEN p_user_id IS NULL THEN 0
          WHEN EXISTS (
            SELECT 1 FROM social_follows sf
            WHERE sf.follower_id = p_user_id AND sf.following_id = sp.user_id
          ) THEN 1
          ELSE 0
        END +
        0.24 * GREATEST(0, LEAST(1, (sp.reactions_count + (2 * sp.comments_count) + (1.5 * sp.saves_count) + sp.shares_count)::NUMERIC / NULLIF(sp.views_count, 0))) +
        0.20 * EXP(-EXTRACT(EPOCH FROM (NOW() - sp.created_at)) / 3600.0 / 72.0) +
        0.12 * GREATEST(0, LEAST(1, sp.comments_count::NUMERIC / 100.0)) +
        0.10 * GREATEST(0, LEAST(1, COALESCE(sprof.seller_reputation, 0) / 100.0))
      )::NUMERIC AS score,
      sp.created_at,
      ROW_NUMBER() OVER (ORDER BY sp.created_at DESC, sp.id DESC) AS rn
    FROM social_posts sp
    LEFT JOIN social_profiles sprof ON sprof.user_id = sp.user_id
    WHERE sp.status = 'published'
      AND (p_cursor_created_at IS NULL OR sp.created_at < p_cursor_created_at)
    ORDER BY score DESC, sp.created_at DESC, sp.id DESC
    LIMIT posts_limit
  ),
  reel_candidates AS (
    SELECT
      'reel'::VARCHAR AS content_type,
      sr.id AS content_id,
      (
        0.30 * GREATEST(0, LEAST(1, sr.watch_completion_avg)) +
        0.22 * GREATEST(0, sr.engagement_rate) +
        0.16 * EXP(-EXTRACT(EPOCH FROM (NOW() - sr.created_at)) / 3600.0 / 48.0) +
        0.12 * CASE
          WHEN p_user_id IS NULL THEN 0
          WHEN EXISTS (
            SELECT 1 FROM social_follows sf
            WHERE sf.follower_id = p_user_id AND sf.following_id = sr.user_id
          ) THEN 1
          ELSE 0
        END +
        0.10 * GREATEST(0, sr.product_click_through) +
        0.06 * GREATEST(0, LEAST(1, sr.quality_score)) +
        0.04 * GREATEST(0, LEAST(1, COALESCE(sprof.seller_reputation, 0) / 100.0))
      )::NUMERIC AS score,
      sr.created_at,
      ROW_NUMBER() OVER (ORDER BY sr.created_at DESC, sr.id DESC) AS rn
    FROM social_reels sr
    LEFT JOIN social_profiles sprof ON sprof.user_id = sr.user_id
    WHERE sr.status = 'published'
      AND (p_cursor_created_at IS NULL OR sr.created_at < p_cursor_created_at)
    ORDER BY score DESC, sr.created_at DESC, sr.id DESC
    LIMIT reels_limit
  ),
  product_candidates AS (
    SELECT
      'product'::VARCHAR AS content_type,
      sp.id AS content_id,
      (
        0.24 * 0.5 +
        0.20 * 0.5 +
        0.16 * 0.5 +
        0.14 * CASE LOWER(COALESCE(sp.condition, 'good'))
          WHEN 'new' THEN 1
          WHEN 'like-new' THEN 0.85
          WHEN 'like new' THEN 0.85
          WHEN 'good' THEN 0.65
          ELSE 0.45
        END +
        0.12 * GREATEST(0, LEAST(1, COALESCE(sprof.seller_reputation, 0) / 100.0)) +
        0.08 * EXP(-EXTRACT(EPOCH FROM (NOW() - sp.created_at)) / 3600.0 / 168.0) +
        0.06 * GREATEST(0, LEAST(1, ((sp.likes_count + sp.saves_count + sp.shares_count)::NUMERIC / NULLIF(sp.views_count, 0))))
      )::NUMERIC AS score,
      sp.created_at,
      ROW_NUMBER() OVER (ORDER BY sp.created_at DESC, sp.id DESC) AS rn
    FROM social_products sp
    LEFT JOIN social_profiles sprof ON sprof.user_id = sp.seller_id
    WHERE sp.status = 'active'
      AND (p_cursor_created_at IS NULL OR sp.created_at < p_cursor_created_at)
    ORDER BY score DESC, sp.created_at DESC, sp.id DESC
    LIMIT products_limit
  ),
  merged AS (
    SELECT * FROM post_candidates
    UNION ALL
    SELECT * FROM reel_candidates
    UNION ALL
    SELECT * FROM product_candidates
  )
  SELECT m.content_type, m.content_id, m.score, m.created_at
  FROM merged m
  ORDER BY m.rn ASC,
           CASE m.content_type WHEN 'post' THEN 1 WHEN 'reel' THEN 2 ELSE 3 END,
           m.score DESC,
           m.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
