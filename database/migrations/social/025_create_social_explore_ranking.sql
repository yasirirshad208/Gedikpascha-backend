-- 025_create_social_explore_ranking.sql

CREATE OR REPLACE FUNCTION social_posts_ranked(
  p_user_id UUID DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_cursor_score NUMERIC DEFAULT NULL,
  p_cursor_created_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE(
  post_id UUID,
  score NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  WITH hidden AS (
    SELECT sch.content_id
    FROM social_content_hides sch
    WHERE p_user_id IS NOT NULL
      AND sch.user_id = p_user_id
      AND sch.content_type = 'post'
      AND (sch.expires_at IS NULL OR sch.expires_at > NOW())
  ),
  base AS (
    SELECT
      sp.id,
      sp.user_id,
      sp.category_id,
      sp.created_at,
      GREATEST(
        0,
        LEAST(
          1,
          (sp.reactions_count + (2 * sp.comments_count) + (1.5 * sp.saves_count) + sp.shares_count)::NUMERIC
          / NULLIF(sp.views_count, 0)
        )
      ) AS engagement_quality,
      GREATEST(0, LEAST(1, sp.comments_count::NUMERIC / 100.0)) AS comment_depth,
      GREATEST(
        0,
        LEAST(
          1,
          ((sp.saves_count + (1.3 * sp.shares_count))::NUMERIC / NULLIF(sp.views_count, 0))
        )
      ) AS save_share_strength,
      EXP(-EXTRACT(EPOCH FROM (NOW() - sp.created_at)) / 3600.0 / 72.0) AS freshness,
      GREATEST(0, LEAST(1, COALESCE(sprof.seller_reputation, 0) / 100.0)) AS seller_trust,
      CASE
        WHEN p_user_id IS NULL THEN 0
        WHEN EXISTS (
          SELECT 1
          FROM social_follows sf
          WHERE sf.follower_id = p_user_id
            AND sf.following_id = sp.user_id
        ) THEN 1
        ELSE 0.2
      END AS creator_affinity,
      CASE WHEN COALESCE(sp.views_count, 0) < 300 THEN 1 ELSE 0 END AS low_exposure,
      CASE
        WHEN p_query IS NULL OR BTRIM(p_query) = '' THEN 0.5
        ELSE GREATEST(
          0,
          LEAST(
            1,
            ts_rank(
              to_tsvector('simple', COALESCE(sp.caption, '')),
              plainto_tsquery('simple', p_query)
            )
          )
        )
      END AS text_rank
    FROM social_posts sp
    LEFT JOIN social_profiles sprof ON sprof.user_id = sp.user_id
    WHERE sp.status = 'published'
      AND (
        p_query IS NULL
        OR BTRIM(p_query) = ''
        OR to_tsvector('simple', COALESCE(sp.caption, '')) @@ plainto_tsquery('simple', p_query)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM hidden h
        WHERE h.content_id = sp.id
      )
  ),
  scored AS (
    SELECT
      b.id,
      b.user_id,
      b.created_at,
      (
        0.24 * b.engagement_quality +
        0.18 * b.freshness +
        0.16 * b.comment_depth +
        0.14 * b.save_share_strength +
        0.12 * b.seller_trust +
        0.10 * b.creator_affinity +
        0.06 * b.text_rank +
        CASE WHEN b.low_exposure = 1 THEN 0.04 ELSE 0 END
      )::NUMERIC AS score
    FROM base b
  ),
  constrained AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY s.user_id
        ORDER BY s.score DESC, s.created_at DESC, s.id DESC
      ) AS creator_rank
    FROM scored s
  )
  SELECT
    c.id,
    c.score,
    c.created_at
  FROM constrained c
  WHERE c.creator_rank <= 2
    AND (
      p_cursor_score IS NULL
      OR c.score < p_cursor_score
      OR (c.score = p_cursor_score AND c.created_at < p_cursor_created_at)
      OR (
        c.score = p_cursor_score
        AND c.created_at = p_cursor_created_at
        AND c.id < p_cursor_id
      )
    )
  ORDER BY c.score DESC, c.created_at DESC, c.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION social_explore_feed_ranked(
  p_user_id UUID DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_cursor_score NUMERIC DEFAULT NULL,
  p_cursor_created_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_cursor_content_type VARCHAR DEFAULT NULL,
  p_cursor_content_id UUID DEFAULT NULL
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
  WITH hidden AS (
    SELECT sch.content_type, sch.content_id
    FROM social_content_hides sch
    WHERE p_user_id IS NOT NULL
      AND sch.user_id = p_user_id
      AND (sch.expires_at IS NULL OR sch.expires_at > NOW())
  ),
  post_pool AS (
    SELECT
      'post'::VARCHAR AS content_type,
      sp.id AS content_id,
      sp.user_id AS creator_id,
      sp.created_at,
      (
        0.24 * GREATEST(
          0,
          LEAST(
            1,
            (sp.reactions_count + (2 * sp.comments_count) + (1.5 * sp.saves_count) + sp.shares_count)::NUMERIC
            / NULLIF(sp.views_count, 0)
          )
        ) +
        0.18 * EXP(-EXTRACT(EPOCH FROM (NOW() - sp.created_at)) / 3600.0 / 72.0) +
        0.16 * GREATEST(0, LEAST(1, sp.comments_count::NUMERIC / 100.0)) +
        0.14 * GREATEST(
          0,
          LEAST(
            1,
            ((sp.saves_count + (1.3 * sp.shares_count))::NUMERIC / NULLIF(sp.views_count, 0))
          )
        ) +
        0.12 * GREATEST(0, LEAST(1, COALESCE(sprof.seller_reputation, 0) / 100.0)) +
        0.10 * CASE
          WHEN p_user_id IS NULL THEN 0
          WHEN EXISTS (
            SELECT 1 FROM social_follows sf
            WHERE sf.follower_id = p_user_id AND sf.following_id = sp.user_id
          ) THEN 1
          ELSE 0.2
        END +
        0.06 * CASE
          WHEN p_query IS NULL OR BTRIM(p_query) = '' THEN 0.5
          ELSE GREATEST(
            0,
            LEAST(
              1,
              ts_rank(
                to_tsvector('simple', COALESCE(sp.caption, '')),
                plainto_tsquery('simple', p_query)
              )
            )
          )
        END +
        CASE WHEN COALESCE(sp.views_count, 0) < 300 THEN 0.04 ELSE 0 END
      )::NUMERIC AS raw_score
    FROM social_posts sp
    LEFT JOIN social_profiles sprof ON sprof.user_id = sp.user_id
    WHERE sp.status = 'published'
      AND (
        p_query IS NULL
        OR BTRIM(p_query) = ''
        OR to_tsvector('simple', COALESCE(sp.caption, '')) @@ plainto_tsquery('simple', p_query)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM hidden h
        WHERE h.content_type = 'post'
          AND h.content_id = sp.id
      )
  ),
  reel_pool AS (
    SELECT
      'reel'::VARCHAR AS content_type,
      sr.id AS content_id,
      sr.user_id AS creator_id,
      sr.created_at,
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
          ELSE 0.2
        END +
        0.10 * GREATEST(0, sr.product_click_through) +
        0.06 * GREATEST(0, LEAST(1, sr.quality_score)) +
        0.04 * GREATEST(0, LEAST(1, COALESCE(sprof.seller_reputation, 0) / 100.0))
      )::NUMERIC AS raw_score
    FROM social_reels sr
    LEFT JOIN social_profiles sprof ON sprof.user_id = sr.user_id
    WHERE sr.status = 'published'
      AND (
        p_query IS NULL
        OR BTRIM(p_query) = ''
        OR to_tsvector('simple', COALESCE(sr.caption, '')) @@ plainto_tsquery('simple', p_query)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM hidden h
        WHERE h.content_type = 'reel'
          AND h.content_id = sr.id
      )
  ),
  product_pool AS (
    SELECT
      'product'::VARCHAR AS content_type,
      sp.id AS content_id,
      sp.seller_id AS creator_id,
      sp.created_at,
      (
        0.24 * CASE
          WHEN p_query IS NULL OR BTRIM(p_query) = '' THEN 0.5
          ELSE GREATEST(
            0,
            LEAST(
              1,
              ts_rank(
                to_tsvector('simple', COALESCE(sp.title, '') || ' ' || COALESCE(sp.description, '')),
                plainto_tsquery('simple', p_query)
              )
            )
          )
        END +
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
      )::NUMERIC AS raw_score
    FROM social_products sp
    LEFT JOIN social_profiles sprof ON sprof.user_id = sp.seller_id
    WHERE sp.status = 'active'
      AND sp.listing_type = 'shop'
      AND (
        p_query IS NULL
        OR BTRIM(p_query) = ''
        OR to_tsvector('simple', COALESCE(sp.title, '') || ' ' || COALESCE(sp.description, '')) @@ plainto_tsquery('simple', p_query)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM hidden h
        WHERE h.content_type = 'product'
          AND h.content_id = sp.id
      )
  ),
  pooled AS (
    SELECT * FROM post_pool
    UNION ALL
    SELECT * FROM reel_pool
    UNION ALL
    SELECT * FROM product_pool
  ),
  constrained AS (
    SELECT
      p.*,
      ROW_NUMBER() OVER (
        PARTITION BY p.content_type
        ORDER BY p.raw_score DESC, p.created_at DESC, p.content_id DESC
      ) AS type_rank,
      ROW_NUMBER() OVER (
        PARTITION BY p.creator_id
        ORDER BY p.raw_score DESC, p.created_at DESC, p.content_id DESC
      ) AS creator_rank
    FROM pooled p
  ),
  selected AS (
    SELECT
      c.content_type,
      c.content_id,
      c.created_at,
      c.raw_score,
      c.type_rank,
      CASE c.content_type
        WHEN 'post' THEN 1
        WHEN 'reel' THEN 2
        ELSE 3
      END AS type_priority
    FROM constrained c
    WHERE c.creator_rank <= 2
      AND (
        (c.content_type = 'post' AND c.type_rank <= (posts_limit * 3)) OR
        (c.content_type = 'reel' AND c.type_rank <= (reels_limit * 3)) OR
        (c.content_type = 'product' AND c.type_rank <= (products_limit * 3))
      )
  ),
  ordered AS (
    SELECT
      s.content_type,
      s.content_id,
      s.created_at,
      (
        (100000 - ((s.type_rank * 10) + s.type_priority))::NUMERIC +
        (s.raw_score / 1000.0)
      )::NUMERIC AS score
    FROM selected s
  )
  SELECT
    o.content_type,
    o.content_id,
    o.score,
    o.created_at
  FROM ordered o
  WHERE (
      p_cursor_score IS NULL
      OR o.score < p_cursor_score
      OR (
        o.score = p_cursor_score
        AND o.created_at < p_cursor_created_at
      )
      OR (
        o.score = p_cursor_score
        AND o.created_at = p_cursor_created_at
        AND (
          CASE o.content_type WHEN 'post' THEN 1 WHEN 'reel' THEN 2 ELSE 3 END >
          CASE COALESCE(p_cursor_content_type, '') WHEN 'post' THEN 1 WHEN 'reel' THEN 2 ELSE 3 END
        )
      )
      OR (
        o.score = p_cursor_score
        AND o.created_at = p_cursor_created_at
        AND o.content_type = p_cursor_content_type
        AND o.content_id < p_cursor_content_id
      )
    )
  ORDER BY
    o.score DESC,
    o.created_at DESC,
    CASE o.content_type WHEN 'post' THEN 1 WHEN 'reel' THEN 2 ELSE 3 END ASC,
    o.content_id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
