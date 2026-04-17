-- 1. Add play_count column to games table
ALTER TABLE public.games ADD COLUMN play_count INTEGER DEFAULT 0;

-- 2. Create a secure increment function
CREATE OR REPLACE FUNCTION increment_play_count(game_id text)
RETURNS void AS $$
BEGIN
  UPDATE public.games
  SET play_count = COALESCE(play_count, 0) + 1
  WHERE id = game_id; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;