-- 1. Create the table to hold developer applications 
CREATE TABLE public.game_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  author_name text NOT NULL,
  email text NOT NULL,
  game_title text NOT NULL,
  description text, 
  rom_url text NOT NULL,
  cover_url text,   
  banner_url text, 
  status text DEFAULT 'pending'
);

-- 2. Create the Storage Bucket for the .nes files and artwork
INSERT INTO storage.buckets (id, name, public) 
VALUES ('submissions', 'submissions', true);

-- 3. Allow anyone to upload files to this bucket
CREATE POLICY "Allow public uploads" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'submissions');