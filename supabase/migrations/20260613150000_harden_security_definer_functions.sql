CREATE OR REPLACE FUNCTION public.increment_play_count(game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.games
  SET play_count = COALESCE(play_count, 0) + 1
  WHERE id = game_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_play_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_play_count(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_play_count(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_play_count(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      NULLIF(new.raw_user_meta_data->>'username', ''),
      NULLIF(new.raw_user_meta_data->>'user_name', ''),
      NULLIF(split_part(COALESCE(new.email, ''), '@', 1), ''),
      'player'
    ),
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
