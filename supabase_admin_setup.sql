-- ==============================================================================
-- POKER ACADEMY: USER MANAGEMENT & CONTROL SQL SETUP
-- ==============================================================================
-- Instructions:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project -> Click "SQL Editor" in the left sidebar
-- 3. Click "New Query", paste this entire script, and click "Run"
-- ==============================================================================

-- 1. Create a secure view for the admin to inspect all registered users
CREATE OR REPLACE VIEW public.app_users AS
SELECT 
  u.id, 
  u.email, 
  u.created_at, 
  u.last_sign_in_at,
  u.banned_until,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)) AS display_name,
  CASE 
    WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN false
    ELSE true
  END AS is_active
FROM auth.users u;

-- Grant permissions on the view to authenticated users
GRANT SELECT ON public.app_users TO authenticated;

-- 2. Function to toggle user active status (Activate / Inactivate via Supabase banned_until)
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(target_user_id uuid, activate boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Verify caller is admin
  IF auth.jwt() ->> 'email' != 'jvazquez.sd@outlook.com' THEN
    RAISE EXCEPTION 'Access denied. Only the administrator can modify user status.';
  END IF;

  -- Protect admin account from being inactivated
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id AND email = 'jvazquez.sd@outlook.com') AND NOT activate THEN
    RAISE EXCEPTION 'Cannot inactivate the primary administrator account.';
  END IF;

  IF activate THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = target_user_id;
  ELSE
    -- Set ban until year 2126
    UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = target_user_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_user_status(uuid, boolean) TO authenticated;

-- 3. Function to directly set a user's password without requiring an email link
CREATE OR REPLACE FUNCTION public.admin_set_user_password(target_user_id uuid, new_plain_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Verify caller is admin
  IF auth.jwt() ->> 'email' != 'jvazquez.sd@outlook.com' THEN
    RAISE EXCEPTION 'Access denied. Only the administrator can reset passwords.';
  END IF;

  IF length(new_plain_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters.';
  END IF;

  UPDATE auth.users 
  SET encrypted_password = extensions.crypt(new_plain_password, extensions.gen_salt('bf'))
  WHERE id = target_user_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO authenticated;

-- 4. Function to permanently delete a user
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Verify caller is admin
  IF auth.jwt() ->> 'email' != 'jvazquez.sd@outlook.com' THEN
    RAISE EXCEPTION 'Access denied. Only the administrator can delete users.';
  END IF;

  -- Protect admin account from deletion
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id AND email = 'jvazquez.sd@outlook.com') THEN
    RAISE EXCEPTION 'Cannot delete the primary administrator account.';
  END IF;

  -- Clean up user references in poker tables if they exist
  DELETE FROM public.poker_players WHERE user_id = target_user_id;
  DELETE FROM public.user_progress WHERE user_id = target_user_id;
  DELETE FROM public.hand_histories WHERE user_id = target_user_id;

  -- Delete from auth.users
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
