-- 027_add_dynamic_filters_to_social_products_ranked.sql
-- Adds category-specific dynamic filters and variation-aware size/color matching.

CREATE OR REPLACE FUNCTION social_products_ranked(
  p_user_id UUID DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_listing_type VARCHAR DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_subcategory_id UUID DEFAULT NULL,
  p_sub_subcategory_id UUID DEFAULT NULL,
  p_condition VARCHAR DEFAULT NULL,
  p_brand TEXT DEFAULT NULL,
  p_size TEXT DEFAULT NULL,
  p_color TEXT DEFAULT NULL,
  p_dynamic_filters JSONB DEFAULT NULL,
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
      COALESCE(spd.product_details_json, '{}'::jsonb) AS product_details_json,
      social_distance_km(p_user_lat, p_user_lng, sp.latitude, sp.longitude) AS distance_km,
      ts_rank(
        to_tsvector('simple', COALESCE(sp.title, '') || ' ' || COALESCE(sp.description, '')),
        plainto_tsquery('simple', COALESCE(NULLIF(p_query, ''), sp.title))
      ) AS text_rank
    FROM social_products sp
    LEFT JOIN social_profiles sprof ON sprof.user_id = sp.seller_id
    LEFT JOIN LATERAL (
      SELECT spa.value::jsonb AS product_details_json
      FROM social_product_attributes spa
      WHERE spa.product_id = sp.id
        AND spa.key = 'product_details_json'
      LIMIT 1
    ) spd ON TRUE
    WHERE sp.status = 'active'
      AND (p_listing_type IS NULL OR sp.listing_type = p_listing_type)
      AND (p_category_id IS NULL OR sp.category_id = p_category_id)
      AND (p_subcategory_id IS NULL OR sp.subcategory_id = p_subcategory_id)
      AND (p_sub_subcategory_id IS NULL OR sp.sub_subcategory_id = p_sub_subcategory_id)
      AND (
        p_condition IS NULL
        OR BTRIM(p_condition) = ''
        OR LOWER(COALESCE(sp.condition, '')) = LOWER(BTRIM(p_condition))
      )
      AND (
        p_brand IS NULL
        OR BTRIM(p_brand) = ''
        OR COALESCE(sp.brand, '') ILIKE ('%' || BTRIM(p_brand) || '%')
      )
      AND (
        p_size IS NULL
        OR BTRIM(p_size) = ''
        OR COALESCE(sp.size, '') ILIKE ('%' || BTRIM(p_size) || '%')
        OR EXISTS (
          SELECT 1
          FROM social_product_variations spv
          WHERE spv.product_id = sp.id
            AND (
              EXISTS (
                SELECT 1
                FROM unnest(COALESCE(spv.variation_values, ARRAY[]::TEXT[])) AS vv(value)
                WHERE vv.value ILIKE ('%' || BTRIM(p_size) || '%')
              )
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(spv.variation_options, '[]'::jsonb)) AS option_entry
                WHERE COALESCE(option_entry ->> 'label', '') ILIKE ('%' || BTRIM(p_size) || '%')
                  OR COALESCE(option_entry ->> 'value', '') ILIKE ('%' || BTRIM(p_size) || '%')
              )
            )
        )
      )
      AND (
        p_color IS NULL
        OR BTRIM(p_color) = ''
        OR COALESCE(sp.color, '') ILIKE ('%' || BTRIM(p_color) || '%')
        OR EXISTS (
          SELECT 1
          FROM social_product_variations spv
          WHERE spv.product_id = sp.id
            AND spv.variation_type = 'color'
            AND (
              EXISTS (
                SELECT 1
                FROM unnest(COALESCE(spv.variation_values, ARRAY[]::TEXT[])) AS vv(value)
                WHERE vv.value ILIKE ('%' || BTRIM(p_color) || '%')
              )
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(spv.variation_options, '[]'::jsonb)) AS option_entry
                WHERE COALESCE(option_entry ->> 'label', '') ILIKE ('%' || BTRIM(p_color) || '%')
                  OR COALESCE(option_entry ->> 'value', '') ILIKE ('%' || BTRIM(p_color) || '%')
              )
            )
        )
      )
      AND (
        p_dynamic_filters IS NULL
        OR p_dynamic_filters = '{}'::jsonb
        OR jsonb_typeof(p_dynamic_filters) <> 'object'
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_each(p_dynamic_filters) AS filter_pair(filter_key, filter_values)
          WHERE BTRIM(filter_pair.filter_key) <> ''
            AND jsonb_typeof(filter_pair.filter_values) = 'array'
            AND jsonb_array_length(filter_pair.filter_values) > 0
            AND NOT (
              CASE
                WHEN jsonb_typeof(COALESCE(spd.product_details_json, '{}'::jsonb) -> filter_pair.filter_key) = 'array' THEN
                  COALESCE(spd.product_details_json, '{}'::jsonb) -> filter_pair.filter_key @> filter_pair.filter_values
                ELSE
                  EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(filter_pair.filter_values) AS selected(value)
                    WHERE LOWER(
                      COALESCE(
                        COALESCE(spd.product_details_json, '{}'::jsonb) ->> filter_pair.filter_key,
                        ''
                      )
                    ) = LOWER(BTRIM(selected.value))
                  )
              END
            )
        )
      )
      AND (p_min_price IS NULL OR sp.price >= p_min_price)
      AND (p_max_price IS NULL OR sp.price <= p_max_price)
      AND (
        p_radius_km IS NULL
        OR social_distance_km(p_user_lat, p_user_lng, sp.latitude, sp.longitude) <= p_radius_km
      )
      AND (
        p_query IS NULL
        OR p_query = ''
        OR to_tsvector('simple', COALESCE(sp.title, '') || ' ' || COALESCE(sp.description, ''))
            @@ plainto_tsquery('simple', p_query)
      )
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
