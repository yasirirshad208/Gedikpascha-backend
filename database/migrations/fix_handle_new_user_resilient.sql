-- Fix: "Database error saving new user" on signup.
-- The on_auth_user_created trigger calls handle_new_user(), which inserts a
-- profile row into public.users. If that insert raises (e.g. an email UNIQUE
-- conflict from an orphaned profile, or any other error), it rolls back the
-- auth.users insert and GoTrue returns 500 "Database error saving new user".
--
-- This redefines the function to be resilient: it handles both id and email
-- conflicts and, as a last resort, swallows any error so signup is never
-- blocked. The application (auth.service.ts) also upserts the profile, so the
-- row is still backfilled on the happy path.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    full_name,
    email,
    is_email_verified,
    email_verified_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
    NEW.email_confirmed_at,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  -- An existing profile with this email under a different id: don't block auth.
  WHEN unique_violation THEN
    RAISE WARNING 'handle_new_user: unique_violation for % (%): %', NEW.id, NEW.email, SQLERRM;
    RETURN NEW;
  -- Any other failure: log and let the auth signup succeed regardless.
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: unexpected error for % (%): %', NEW.id, NEW.email, SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure the trigger exists and points at the function.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
