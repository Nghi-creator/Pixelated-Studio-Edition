ALTER TABLE public.game_submissions
ADD COLUMN IF NOT EXISTS submitter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.game_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own game submissions"
ON public.game_submissions;

CREATE POLICY "Users can view own game submissions"
ON public.game_submissions FOR SELECT
USING (auth.uid() = submitter_id);

DROP POLICY IF EXISTS "Admins can view game submissions"
ON public.game_submissions;

CREATE POLICY "Admins can view game submissions"
ON public.game_submissions FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Allow public uploads"
ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can upload submissions"
ON storage.objects;

CREATE POLICY "Authenticated users can upload submissions"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'submissions'
  AND auth.role() = 'authenticated'
);
