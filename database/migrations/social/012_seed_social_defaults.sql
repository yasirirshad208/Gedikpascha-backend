INSERT INTO social_quick_replies (text, display_order)
VALUES
  ('Sounds great, deal!', 1),
  ('When can you ship?', 2),
  ('Just dropped it off.', 3),
  ('Received it, thank you!', 4),
  ('Can you share tracking number?', 5)
ON CONFLICT (text) DO NOTHING;

INSERT INTO social_ranking_config (key, weights)
VALUES
  (
    'reels_default',
    '{"watch_completion":0.30,"engagement_rate":0.22,"freshness":0.16,"creator_affinity":0.12,"product_click_through":0.10,"quality_score":0.06,"seller_trust":0.04}'::JSONB
  ),
  (
    'products_default',
    '{"text_relevance":0.24,"distance_boost":0.20,"price_value":0.16,"condition_quality":0.14,"seller_reputation":0.12,"freshness":0.08,"engagement":0.06}'::JSONB
  )
ON CONFLICT (key) DO UPDATE SET weights = EXCLUDED.weights, updated_at = NOW();

INSERT INTO social_notification_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

UPDATE social_profiles
SET username = CONCAT('user_', SUBSTRING(user_id::TEXT FROM 1 FOR 8))
WHERE username IS NULL OR username = '';

UPDATE social_profiles
SET display_name = username
WHERE display_name IS NULL OR display_name = '';
