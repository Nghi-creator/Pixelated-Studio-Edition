ALTER TABLE public.access_logs
ADD COLUMN IF NOT EXISTS path text;

UPDATE public.access_logs
SET path = '/'
WHERE path IS NULL;

ALTER TABLE public.access_logs
ALTER COLUMN path SET DEFAULT '/';

ALTER TABLE public.access_logs
ALTER COLUMN path SET NOT NULL;
