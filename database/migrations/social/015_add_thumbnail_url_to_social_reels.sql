-- 015_add_thumbnail_url_to_social_reels.sql
-- Adds a direct thumbnail_url column on social_reels for faster feed/profile reads
-- and keeps it synced from social_reel_media.

ALTER TABLE social_reels
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

WITH first_media AS (
  SELECT DISTINCT ON (reel_id)
    reel_id,
    COALESCE(thumbnail_url, reel_url) AS resolved_thumbnail_url
  FROM social_reel_media
  ORDER BY reel_id, created_at ASC, id ASC
)
UPDATE social_reels sr
SET thumbnail_url = fm.resolved_thumbnail_url
FROM first_media fm
WHERE sr.id = fm.reel_id
  AND (sr.thumbnail_url IS NULL OR sr.thumbnail_url = '');

CREATE OR REPLACE FUNCTION social_sync_reel_thumbnail_from_media()
RETURNS TRIGGER AS $$
DECLARE
  v_reel_id UUID;
  v_thumbnail_url TEXT;
BEGIN
  v_reel_id := COALESCE(NEW.reel_id, OLD.reel_id);

  SELECT COALESCE(srm.thumbnail_url, srm.reel_url)
  INTO v_thumbnail_url
  FROM social_reel_media srm
  WHERE srm.reel_id = v_reel_id
  ORDER BY srm.created_at ASC, srm.id ASC
  LIMIT 1;

  UPDATE social_reels
  SET thumbnail_url = v_thumbnail_url
  WHERE id = v_reel_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_sync_reel_thumbnail_from_media ON social_reel_media;
CREATE TRIGGER trigger_social_sync_reel_thumbnail_from_media
AFTER INSERT OR UPDATE OR DELETE ON social_reel_media
FOR EACH ROW
EXECUTE FUNCTION social_sync_reel_thumbnail_from_media();
