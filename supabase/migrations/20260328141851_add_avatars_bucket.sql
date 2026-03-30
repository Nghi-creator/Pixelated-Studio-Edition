-- 1. Create a public storage bucket named 'avatars'
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true);

-- 2. Allow public access to read the files
CREATE POLICY "Avatar images are publicly accessible." 
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

-- 3. Allow logged-in users to upload files
CREATE POLICY "Users can upload their own avatars." 
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND auth.uid() = owner
  );

-- 4. Allow users to update/delete their own files
CREATE POLICY "Users can update their own avatars."
  ON storage.objects FOR UPDATE USING (
    bucket_id = 'avatars' AND auth.uid() = owner
  );
CREATE POLICY "Users can delete their own avatars."
  ON storage.objects FOR DELETE USING (
    bucket_id = 'avatars' AND auth.uid() = owner
  );