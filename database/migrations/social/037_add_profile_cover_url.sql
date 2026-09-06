-- ============================================================================
-- 037: Give profiles their own cover image.
--
-- The profile page had no cover field, so it fell back to the user's most
-- recent post image. That made every new post silently replace the profile
-- cover. With a real column the cover is set deliberately and stays put.
-- ============================================================================

ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS cover_url TEXT;
