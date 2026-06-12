-- =============================================================================
-- Payments Phase 2: Link brands and social profiles to sub_merchants.
-- =============================================================================

ALTER TABLE wholesale_brands
  ADD COLUMN IF NOT EXISTS sub_merchant_id  UUID REFERENCES sub_merchants(id),
  ADD COLUMN IF NOT EXISTS payout_status    TEXT NOT NULL DEFAULT 'not_onboarded'
    CHECK (payout_status IN ('not_onboarded','draft','submitted','active','rejected','suspended','onboarding_failed'));

ALTER TABLE retail_brands
  ADD COLUMN IF NOT EXISTS sub_merchant_id  UUID REFERENCES sub_merchants(id),
  ADD COLUMN IF NOT EXISTS payout_status    TEXT NOT NULL DEFAULT 'not_onboarded'
    CHECK (payout_status IN ('not_onboarded','draft','submitted','active','rejected','suspended','onboarding_failed'));

-- Social sellers are individuals; link directly from the profile.
ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS sub_merchant_id  UUID REFERENCES sub_merchants(id),
  ADD COLUMN IF NOT EXISTS payout_status    TEXT NOT NULL DEFAULT 'not_onboarded'
    CHECK (payout_status IN ('not_onboarded','draft','submitted','active','rejected','suspended','onboarding_failed'));

CREATE INDEX IF NOT EXISTS idx_wholesale_brands_sub_merchant ON wholesale_brands(sub_merchant_id);
CREATE INDEX IF NOT EXISTS idx_retail_brands_sub_merchant ON retail_brands(sub_merchant_id);
CREATE INDEX IF NOT EXISTS idx_social_profiles_sub_merchant ON social_profiles(sub_merchant_id);
