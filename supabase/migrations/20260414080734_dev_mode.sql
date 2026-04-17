ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS author_name text;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_developer boolean DEFAULT false;