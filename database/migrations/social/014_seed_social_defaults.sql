-- 014_seed_social_defaults.sql

CREATE TABLE IF NOT EXISTS social_system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO social_system_config (key, value, description)
VALUES
  (
    'reels_ranking_weights',
    '{"watch_completion":0.30,"engagement_rate":0.22,"freshness":0.16,"creator_affinity":0.12,"product_click_through":0.10,"quality_score":0.06,"seller_trust":0.04}'::jsonb,
    'Weights for social reels ranking algorithm'
  ),
  (
    'products_ranking_weights',
    '{"text_relevance":0.24,"distance_boost":0.20,"price_value":0.16,"condition_quality":0.14,"seller_reputation":0.12,"freshness":0.08,"engagement":0.06}'::jsonb,
    'Weights for social product ranking algorithm'
  ),
  (
    'feed_mix_ratio',
    '{"posts":8,"reels":7,"products":5}'::jsonb,
    'Default composition for each 20 home feed items'
  ),
  (
    'reels_diversity_rules',
    '{"max_per_creator":2,"max_category_ratio":0.35,"exploration_ratio":0.15}'::jsonb,
    'Diversity constraints for reels feed'
  )
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO social_notification_preferences (user_id)
SELECT u.id
FROM users u
ON CONFLICT (user_id) DO NOTHING;
