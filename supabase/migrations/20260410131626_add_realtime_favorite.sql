ALTER PUBLICATION supabase_realtime ADD TABLE favorites;

ALTER TABLE public.favorites REPLICA IDENTITY FULL;