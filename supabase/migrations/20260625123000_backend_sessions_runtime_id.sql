ALTER TABLE public.backend_sessions
ADD COLUMN IF NOT EXISTS boot_runtime_id text;

UPDATE public.backend_sessions
SET boot_runtime_id = 'mesen'
WHERE boot_runtime_id IS NULL;

ALTER TABLE public.backend_sessions
ALTER COLUMN boot_runtime_id SET NOT NULL;
