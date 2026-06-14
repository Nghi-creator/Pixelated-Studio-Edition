CREATE OR REPLACE FUNCTION public.set_game_reaction(
  p_user_id uuid,
  p_game_id text,
  p_is_like boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_is_like IS NULL THEN
    DELETE FROM public.likes
    WHERE user_id = p_user_id AND game_id = p_game_id;
  ELSE
    INSERT INTO public.likes (user_id, game_id, is_like)
    VALUES (p_user_id, p_game_id, p_is_like)
    ON CONFLICT (user_id, game_id)
    DO UPDATE SET is_like = EXCLUDED.is_like;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_game_reaction(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_game_reaction(uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.set_game_reaction(uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_game_reaction(uuid, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.set_comment_reaction(
  p_user_id uuid,
  p_comment_id uuid,
  p_is_like boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_is_like IS NULL THEN
    DELETE FROM public.comment_likes
    WHERE user_id = p_user_id AND comment_id = p_comment_id;
  ELSE
    INSERT INTO public.comment_likes (user_id, comment_id, is_like)
    VALUES (p_user_id, p_comment_id, p_is_like)
    ON CONFLICT (user_id, comment_id)
    DO UPDATE SET is_like = EXCLUDED.is_like;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_comment_reaction(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_comment_reaction(uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.set_comment_reaction(uuid, uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_comment_reaction(uuid, uuid, boolean) TO service_role;
