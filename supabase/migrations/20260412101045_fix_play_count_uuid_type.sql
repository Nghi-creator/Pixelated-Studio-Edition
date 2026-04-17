-- 1. Remove the old function that causes the type conflict
DROP FUNCTION IF EXISTS public.increment_play_count(text);

-- 2. Create the correct one expecting a UUID
CREATE OR REPLACE FUNCTION increment_play_count(game_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.games
  SET play_count = COALESCE(play_count, 0) + 1
  WHERE id = game_id; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;