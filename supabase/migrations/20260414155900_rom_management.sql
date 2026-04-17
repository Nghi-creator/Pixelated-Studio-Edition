-- Create the Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('default_library', 'default_library', true);

-- Allow public read access
CREATE POLICY "Allow public read access" ON storage.objects 
FOR SELECT USING (bucket_id = 'default_library');