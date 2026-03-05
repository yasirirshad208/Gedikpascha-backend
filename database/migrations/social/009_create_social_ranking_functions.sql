CREATE TABLE IF NOT EXISTS social_ranking_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(80) UNIQUE NOT NULL,
  weights JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION social_distance_km(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  radlat1 DOUBLE PRECISION;
  radlat2 DOUBLE PRECISION;
  theta DOUBLE PRECISION;
  radtheta DOUBLE PRECISION;
  dist DOUBLE PRECISION;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN NULL;
  END IF;

  radlat1 := PI() * lat1 / 180;
  radlat2 := PI() * lat2 / 180;
  theta := lng1 - lng2;
  radtheta := PI() * theta / 180;

  dist := SIN(radlat1) * SIN(radlat2) + COS(radlat1) * COS(radlat2) * COS(radtheta);
  dist := LEAST(1, GREATEST(-1, dist));
  dist := ACOS(dist);
  dist := dist * 180 / PI();
  dist := dist * 60 * 1.1515;
  dist := dist * 1.609344;

  RETURN dist;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION social_compute_reel_score(
  watch_completion NUMERIC,
  engagement_rate NUMERIC,
  created_at TIMESTAMPTZ,
  creator_affinity NUMERIC,
  product_click_through NUMERIC,
  quality_score NUMERIC,
  seller_trust NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  age_hours NUMERIC;
  freshness NUMERIC;
BEGIN
  age_hours := GREATEST(1, EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0);
  freshness := EXP(-age_hours / 72.0);

  RETURN
    0.30 * COALESCE(watch_completion, 0) +
    0.22 * COALESCE(engagement_rate, 0) +
    0.16 * COALESCE(freshness, 0) +
    0.12 * COALESCE(creator_affinity, 0) +
    0.10 * COALESCE(product_click_through, 0) +
    0.06 * COALESCE(quality_score, 0) +
    0.04 * COALESCE(seller_trust, 0);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION social_compute_product_score(
  text_relevance NUMERIC,
  distance_boost NUMERIC,
  price_value NUMERIC,
  condition_quality NUMERIC,
  seller_reputation NUMERIC,
  freshness NUMERIC,
  engagement NUMERIC
)
RETURNS NUMERIC AS $$
BEGIN
  RETURN
    0.24 * COALESCE(text_relevance, 0) +
    0.20 * COALESCE(distance_boost, 0) +
    0.16 * COALESCE(price_value, 0) +
    0.14 * COALESCE(condition_quality, 0) +
    0.12 * COALESCE(seller_reputation, 0) +
    0.08 * COALESCE(freshness, 0) +
    0.06 * COALESCE(engagement, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP VIEW IF EXISTS social_ranked_reels;
CREATE VIEW social_ranked_reels AS
SELECT
  r.*,
  social_compute_reel_score(
    r.watch_completion,
    r.engagement_rate,
    r.created_at,
    r.creator_affinity,
    r.product_click_through,
    r.quality_score,
    r.seller_trust
  ) AS rank_score
FROM social_reels r
WHERE r.is_published = true
  AND r.is_live = false;

DROP VIEW IF EXISTS social_ranked_products;
CREATE VIEW social_ranked_products AS
SELECT
  p.*,
  social_compute_product_score(
    0.5,
    0.5,
    CASE
      WHEN p.reference_price IS NULL OR p.reference_price = 0 THEN 0.5
      ELSE LEAST(1, p.reference_price / NULLIF(p.price, 0))
    END,
    CASE
      WHEN p.condition = 'new' THEN 1
      WHEN p.condition = 'like_new' THEN 0.95
      WHEN p.condition = 'good' THEN 0.8
      WHEN p.condition = 'fair' THEN 0.6
      ELSE 0.5
    END,
    COALESCE(p.seller_reputation, 0.5),
    EXP(-GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p.created_at))/3600.0) / 96.0),
    COALESCE(p.engagement_score, 0)
  ) AS rank_score
FROM social_products p
WHERE p.is_published = true
  AND p.status IN ('active', 'reserved');
