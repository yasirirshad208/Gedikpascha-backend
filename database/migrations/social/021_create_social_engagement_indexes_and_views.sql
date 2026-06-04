-- 021_create_social_engagement_indexes_and_views.sql

CREATE INDEX IF NOT EXISTS idx_social_likes_user_content
ON social_likes(user_id, content_type, content_id);

CREATE INDEX IF NOT EXISTS idx_social_likes_content_created
ON social_likes(content_type, content_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_saves_user_content
ON social_saves(user_id, content_type, content_id);

CREATE INDEX IF NOT EXISTS idx_social_saves_content_created
ON social_saves(content_type, content_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_shares_user_content
ON social_shares(user_id, content_type, content_id);

CREATE INDEX IF NOT EXISTS idx_social_shares_content_created
ON social_shares(content_type, content_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_comments_content_created
ON social_comments(content_type, content_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_social_comments_parent_created
ON social_comments(parent_comment_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_social_comments_user_created
ON social_comments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_views_viewer_content_created
ON social_views(viewer_id, content_type, content_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_views_session_content_created
ON social_views(session_key, content_type, content_id, created_at DESC);

CREATE OR REPLACE VIEW social_content_comment_totals AS
SELECT
  sc.content_type,
  sc.content_id,
  COUNT(*)::BIGINT AS total_comments,
  MAX(sc.created_at) AS last_commented_at
FROM social_comments sc
GROUP BY sc.content_type, sc.content_id;

